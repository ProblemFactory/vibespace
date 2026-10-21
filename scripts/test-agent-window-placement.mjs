#!/usr/bin/env node
// AN AGENT'S ACTION MAY PLACE A WINDOW; ONLY A PERSON'S ACTION MAY FOCUS ONE (lane agent-window-no-steal, owner 2026-10-11:
// "我另一个对话操作chrome的时候还是疯狂把自己提到前台" — six agent Chromes in a day, each opened in front of his work).
// FAST, in-process: ① the PURE verdict table src/lib/desktop-app-placement.js agentWindowPlacement — every origin × the chat
// on this desk / another desk / minimized / hidden here / absent × the active window (the chat, another, none) × the
// split-frame `looking` fact × phone × the setting ⇒ {act, focus, deskSwitch, badge}; ② satelliteFocus (rule 3); ③ RED
// controls: a copy whose setting gate is gone yields focus:true for an agent row, and a copy that keeps 'beside' for the
// incident row (inc-mvhebl4n-rkvr) — each census below goes red on its copy; ④ the doors read the verdict (source pins:
// app.js, desktop-app-window.js, xpra-view.js, window.js, browser-live-window.js, design-window.js, agent-card.js);
// ⑤ the setting (default OFF, said in its description, zh/ja words).
// lane agent-window-no-pop (owner incident inc-mvhebl4n-rkvr, 2026-10-21 「design还是被强行弹出了」): an agent never changes
// the arrangement of the desk a person is using — beside ONLY where he looks at that chat; else the chat's card + badge.
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
  split: [{ ...CHAT, minimized: false, hidden: false, deskId: 'd1', looking: true }], // the active window is a pane of the chat's split frame
  otherDesk: [{ ...CHAT, minimized: false, hidden: true, deskId: 'd2' }],
  minimized: [{ ...CHAT, minimized: true, hidden: false, deskId: 'd1' }],
  hiddenHere: [{ ...CHAT, minimized: false, hidden: true, deskId: null }],
  none: [{ winId: 'win-x', sessionId: 'w-B', minimized: false, hidden: false, deskId: 'd1' }],
};
const ACTIVES = [null, 'win-editor', 'win-chat'];
const MSGS = {
  app: (origin) => ({ type: 'desktop-app-opened', sessionId: 'w-A', appId: 'da-1', ...(origin ? { origin } : {}) }),
  design: () => ({ type: 'design-open', sessionId: 'w-A', openSpec: { action: 'openDesign', host: null, dir: '/proj/designs/x', sessionId: 'w-A' } }),
  live: () => ({ type: 'browser-live-start', sessionId: 'w-A' }),
};
/** Every row of the table through module `P` → [{row, out}] (the desktop-app push × every origin; the design + live pushes) */
function table(P, kinds = ['app']) {
  const rows = [];
  for (const kind of kinds) for (const origin of (kind === 'app' ? ORIGINS : ['agent'])) for (const [state, chats] of Object.entries(STATES)) for (const active of ACTIVES) for (const phone of [false, true]) for (const front of [false, true]) {
    const row = { kind, origin, state, active, phone, front };
    rows.push({ row, out: P.agentWindowPlacement({ msg: MSGS[kind](origin), chats, active, desk: 'd1', phone, front }) });
  }
  return rows;
}
const agent = (o) => o.row.origin && o.row.origin !== 'user';
/** The person is looking at that chat: its window is the active one, or the active window shares its split frame. */
const lookingRow = (o) => (o.row.state === 'here' && o.row.active === 'win-chat') || o.row.state === 'split';
/** THE INVARIANT (agent-window-no-steal): with the setting off, no row focuses and no row switches a desktop. → the offenders */
const focusOffenders = (rows) => rows.filter(({ row, out }) => out.deskSwitch !== false || (!row.front && out.focus !== false));
/** THE INVARIANT (agent-window-no-pop): with the setting off, on a desktop, a window opens on the person's desk (beside / its
 *  own) ONLY where he looks at that chat; a chat on screen he is not looking at — the incident's row — gets a card. */
const arrangers = (rows) => rows.filter((o) => agent(o) && !o.row.front && !o.row.phone && (o.out.act === 'beside' || o.out.act === 'own') && !lookingRow(o));

console.log('① the PURE verdict table');
{
  const P = await import(pathToFileURL(path.join(REPO, REL)).href);
  const rows = table(P);
  ok(rows.length === 4 * 6 * 3 * 2 * 2, `${rows.length} rows`);
  ok(focusOffenders(rows).length === 0, 'setting OFF ⇒ focus:false on EVERY row; deskSwitch:false on every row (setting ON too)', focusOffenders(rows).slice(0, 3));
  ok(arrangers(rows).length === 0, 'setting OFF ⇒ NO row opens a window on the person\'s desk unless he is looking at that chat (agent-window-no-pop)', arrangers(rows).slice(0, 3));
  ok(rows.filter((o) => !agent(o)).every((o) => o.out.act === 'none'), 'a person\'s origin (user / none) ⇒ nothing opens from the broadcast (his own launch keeps its own door: front + focus)');
  const off = rows.filter((o) => agent(o) && !o.row.front && !o.row.phone);
  ok(off.filter(lookingRow).every((o) => o.out.act === 'beside' && o.out.fromWin === 'win-chat' && o.out.badge && o.out.why === 'looking'), 'the person LOOKS at that chat (it is the active window, or its split partner is) ⇒ beside it, quiet, the new window pulses');
  ok(off.filter((o) => o.row.state === 'here' && o.row.active !== 'win-chat').every((o) => o.out.act === 'card' && o.out.fromWin === 'win-chat' && o.out.badge && o.out.why === 'showing-quiet'), 'chat SHOWN on this desk, the person elsewhere (another window active, or none) ⇒ card: NO window, the chat\'s card + its badge (inc-mvhebl4n-rkvr)');
  ok(off.filter((o) => o.row.state === 'otherDesk').every((o) => o.out.act === 'desk' && o.out.deskId === 'd2' && o.out.badge), 'chat on ANOTHER desk ⇒ created on that desk (hidden by the desktop model), no switch');
  ok(off.filter((o) => o.row.state === 'minimized').every((o) => o.out.act === 'card' && o.out.why === 'minimized-chat' && o.out.badge), 'chat minimized ⇒ card (no window on the person\'s desk)');
  ok(off.filter((o) => o.row.state === 'hiddenHere').every((o) => o.out.act === 'card' && o.out.why === 'hidden-chat'), 'chat hidden but on no other desk ⇒ card');
  ok(off.filter((o) => o.row.state === 'none').every((o) => o.out.act === 'none' && o.out.why === 'not-here'), 'no window of that chat on this client ⇒ nothing (D3: a client without the chat opens nothing)');
  const ph = rows.filter((o) => agent(o) && !o.row.front && o.row.phone);
  ok(ph.filter((o) => o.row.state === 'here' || o.row.state === 'split').every((o) => o.out.act === 'own' && !o.out.focus && o.out.badge), 'phone showing the chat ⇒ its own window, NOT shown (the shown window stays), the title badge says it is there');
  ok(ph.filter((o) => o.row.state !== 'here' && o.row.state !== 'split').every((o) => o.out.act === 'none'), 'phone not showing the chat ⇒ nothing');
  const on = rows.filter((o) => agent(o) && o.row.front);
  const old = (o) => P.agentBrowserPlacement({ msg: { type: 'desktop-app-opened', sessionId: 'w-A', appId: 'da-1', origin: 'agent-browser' }, chats: STATES[o.row.state], phone: o.row.phone });
  ok(on.every((o) => o.out.act === old(o).act && o.out.focus === (o.out.act !== 'none') && !o.out.badge), 'setting ON ⇒ exactly D3\'s old answer (beside / own on a phone / nothing) WITH focus — today\'s behaviour');
  ok(P.agentWindowPlacement({ msg: MSGS.app('agent-browser'), chats: STATES.here, active: 'win-chat', visible: false }).act === 'none', 'a hidden page opens nothing');
}

console.log('①d the design-open and browser-live-start pushes ride the SAME verdict (lanes design-window-placement, agent-window-no-pop)');
{
  const P = await import(pathToFileURL(path.join(REPO, REL)).href);
  const drows = table(P, ['design', 'live']);
  ok(drows.length === 2 * 6 * 3 * 2 * 2, `${drows.length} design-open + browser-live-start rows`);
  ok(focusOffenders(drows).length === 0, 'design / live: setting OFF ⇒ focus:false on every row; deskSwitch:false on every row (ON too)');
  ok(arrangers(drows).length === 0, 'design / live: setting OFF ⇒ no window on the person\'s desk unless he looks at that chat', arrangers(drows).slice(0, 3));
  // THE INCIDENT'S ROW (inc-mvhebl4n-rkvr, 00:50:26Z): the platform-dev chat SHOWING on 「工作」, the vault window active
  const chats = [{ winId: 'win-mv6ygucc-l27y', sessionId: 'sess-1-1791912552582', minimized: false, hidden: false, deskId: 'desk-mnxjmcf2-jcp', looking: false }];
  const inc = { type: 'design-open', sessionId: 'sess-1-1791912552582', openSpec: { action: 'openDesign', host: null, dir: '/w/platform-dev/designs/pre-sign', sessionId: 'sess-1-1791912552582' } };
  const r = P.agentWindowPlacement({ msg: inc, chats, active: 'win-mvheb8b5-0nd5', desk: 'desk-mnxjmcf2-jcp' });
  ok(r.act === 'card' && r.act !== 'beside' && r.fromWin === 'win-mv6ygucc-l27y' && r.badge && !r.focus && r.why === 'showing-quiet', 'THE INCIDENT\'S ROW: a design-open for a chat SHOWING (not minimized, not active) on the active desk ⇒ card — never beside (the base answered beside / showing-quiet: the half-snap)', r);
  const ra = P.agentWindowPlacement({ msg: inc, chats, active: 'win-mv6ygucc-l27y', desk: 'desk-mnxjmcf2-jcp' });
  ok(ra.act === 'beside' && !ra.focus, '…the same push while that chat IS the active window ⇒ beside (the person is in that conversation), never focused', ra);
  const rd = P.agentWindowPlacement({ msg: inc, chats: [{ ...chats[0], hidden: true, deskId: 'desk-mnxot8k2-see' }], active: 'win-mvheb8b5-0nd5', desk: 'desk-mnxjmcf2-jcp' });
  ok(rd.act === 'desk' && rd.deskId === 'desk-mnxot8k2-see', '…the chat on ANOTHER desk ⇒ desk, as before (placing there changes nothing the person sees)', rd);
  const d = drows.filter((o) => o.row.kind === 'design' && !o.row.front && !o.row.phone);
  ok(d.filter(lookingRow).every((o) => o.out.act === 'beside' && o.out.fromWin === 'win-chat'), 'design: looking ⇒ beside (the snapped halves)');
  ok(d.filter((o) => !lookingRow(o) && ['here', 'minimized', 'hiddenHere'].includes(o.row.state)).every((o) => o.out.act === 'card' && o.out.fromWin === 'win-chat' && o.out.badge), 'design: shown-not-looking / minimized / hidden here ⇒ card (no window)');
  ok(d.filter((o) => o.row.state === 'otherDesk').every((o) => o.out.act === 'desk' && o.out.deskId === 'd2'), 'design: another desk ⇒ desk');
  const l = drows.filter((o) => o.row.kind === 'live' && !o.row.front && !o.row.phone);
  ok(l.filter(lookingRow).every((o) => o.out.act === 'beside') && l.filter((o) => !lookingRow(o) && o.row.state !== 'none').every((o) => o.out.act === 'card'), 'live view (the agent browser\'s twin): looking ⇒ beside (born in the chat\'s chain); every other chat row — another desk too — ⇒ card (a live view is born only into a chain on screen)');
  ok(l.filter((o) => o.row.state === 'otherDesk').every((o) => o.out.why === 'other-desk-live'), 'live view on another desk says why: other-desk-live');
  const dOn = drows.filter((o) => o.row.front);
  ok(dOn.filter((o) => (o.row.state === 'here' || o.row.state === 'split') && !o.row.phone).every((o) => o.out.act === 'beside' && o.out.focus === true), 'setting ON ⇒ beside any chat on screen + focus — the old answer (the control)');
  ok(dOn.filter((o) => o.row.state === 'none').every((o) => o.out.act === 'none'), 'setting ON + no chat here ⇒ still nothing');
  ok(P.agentPlacedSession(MSGS.design()) === 'w-A' && P.agentPlacedSession({ type: 'desktop-app-opened', origin: 'self-open', appId: 'a', sessionId: 'w-Q' }) === 'w-Q' && P.agentPlacedSession(MSGS.live()) === 'w-A' && P.LIVE_START === 'browser-live-start', 'agentPlacedSession reads the session id of ALL THREE pushes');
  ok([{ type: 'design-open', sessionId: 'w-A', openSpec: { action: 'openDesign', dir: '' } }, { type: 'design-open', sessionId: '', openSpec: { action: 'openDesign', dir: '/d' } }, { type: 'design-open', sessionId: 'w-A', openSpec: { action: 'other', dir: '/d' } }, { type: 'design-open', sessionId: 'w-A' }, { type: 'browser-live-start' }].every((m) => P.agentWindowPlacement({ msg: m, chats: STATES.here, active: 'win-chat' }).act === 'none' && P.agentPlacedSession(m) === null), 'a design-open with no folder / no session / a non-openDesign action / no openSpec, a live start with no session ⇒ nothing opens (a person’s door never rides these pushes)');
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
    // lane agent-window-no-pop: THE BASE'S ANSWER for the incident row — a copy that keeps 'beside' for a chat that is only SHOWING
    const from2 = "return card('showing-quiet');";
    ok(src.includes(from2), 'the incident mutant\'s anchor is in the module');
    fs.writeFileSync(path.join(dir, 'mutant2.mjs'), src.replace(from2, "return { ...base, act: 'beside', fromWin: chat.winId, badge: true, why: 'showing-quiet' };"));
    const M2 = await import(pathToFileURL(path.join(dir, 'mutant2.mjs')).href);
    const bad2 = arrangers([...table(M2), ...table(M2, ['design', 'live'])]);
    const inc2 = M2.agentWindowPlacement({ msg: MSGS.design(), chats: STATES.here, active: 'win-editor', desk: 'd1' });
    ok(bad2.length > 0 && bad2.some((o) => o.row.kind === 'design' && o.row.state === 'here' && o.row.active === 'win-editor') && inc2.act === 'beside', `MUTANT (the base's half-snap for a showing chat) ⇒ the arrangement census goes RED (${bad2.length} rows open a window on the person's desk while he looks elsewhere)`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('④ the doors read the verdict');
{
  const app = read('src/lib/app.js');
  ok(/agentPlacement\(msg\) \{/.test(app) && /return agentWindowPlacement\(\{ msg, chats, active, desk: this\.desktopManager\?\.activeDesktopId \|\| null, phone: !!this\.isMobile, visible: document\.visibilityState !== 'hidden', front: this\.settings\?\.get\('desktop\.agentWindowsFront'\) === true \}\);/.test(app), 'app.agentPlacement — THE facts every door hands the verdict (the setting is `front`)');
  ok(/const looking = !!active && \(active === winId \|\| !!\(ch && ch\.tabs\.includes\(active\) && displayedPanes\(ch\)\.includes\(String\(winId\)\)\)\);/.test(app), '…`looking` = the active window IS that chat, or a pane of the split frame that shows it (displayedPanes)');
  ok((app.match(/const p = this\.agentPlacement\(msg\);/g) || []).length === 2 && !/agentWindowPlacement\(\{ msg, chats, active: this\.wm/.test(app), 'BOTH app.js doors (desktop-app-opened, placeAgentWindow) ask through it — no second facts builder');
  ok(/if \(p\.act === 'card'\) \{ this\.wm\.markArrived\(p\.fromWin\); return; \}/.test(app), 'desktop-app-opened: card ⇒ NO window, the chat\'s badge (its window chip opens it)');
  ok(/this\.openDesktopApp\(msg\.appId, \{ intoChain: p\.act === 'beside' \? this\.linkPlacement\(p\.fromWin\) : undefined, quiet: true \}\)/.test(app), 'focus:false ⇒ openDesktopApp(…, {quiet: true}) — beside through lane F\'s split door');
  ok(/if \(p\.act === 'desk'\) this\.desktopManager\?\.moveWindowToDesktop\(w\.id, p\.deskId\);/.test(app) && /else if \(!w\._tabChain\) this\.wm\.placeBehind\(w\.id\);/.test(app) && /if \(p\.badge\) this\.wm\.markArrived\(w\.id\);/.test(app) && !/p\.minimize/.test(app), 'desk ⇒ moved to the chat\'s desktop (no switch); a free window ⇒ placeBehind; badge ⇒ markArrived; no minimize branch left (no row minimizes)');
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
  ok(/const p = app\.agentPlacement \? app\.agentPlacement\(\{ type: LIVE_START, sessionId: l\.sessionId \}\) : \{ act: 'none' \};/.test(bl) && /if \(p\.act === 'card'\) \{ app\.wm\.markArrived\(p\.fromWin\); continue; \}/.test(bl) && /if \(p\.act !== 'beside'\) continue;/.test(bl), 'the live view the agent\'s browser start auto-opens asks THE SAME verdict (browser-live-start): beside only where the person looks, card ⇒ no window + the chat\'s badge');
  ok(/const quiet = !p\.focus;/.test(bl) && /syncId, intoChain, quiet \}\);/.test(bl) && !/host\._hiddenByDesktop \|\| host\.isMinimized\) continue;/.test(bl.slice(bl.indexOf('export function autoBindLiveViews('), bl.indexOf('export function autoOpenOnPhone('))), '…quiet unless the verdict focuses it (the front setting); the old inline "on screen" test is gone (the verdict owns it)');
  // lane design-window-placement: the Design window's door reads the SAME verdict, through app.placeAgentWindow
  const dw = read('src/lib/design-window.js');
  ok(/app\.placeAgentWindow\(m, \(p, \{ focus \}\) => \(\{/.test(dw) && /win: openDesign\(app, \{ host: spec\.host \|\| '', dir: spec\.dir, sessionId: sid, quiet: !focus \}\)/.test(dw), 'installDesignWindow routes the design-open push through app.placeAgentWindow (quiet unless the front setting focuses it)');
  ok(/const open = \(\) => app\.openDesign\(\{ host: spec\.host \|\| '', dir: spec\.dir, sessionId: sid \}\);/.test(dw) && /app\.sessions\?\.get\?\.\(p\.fromWin\)\?\.showAgentCard\?\.\(\{ key: `\$\{h\}\|\$\{foldPath\(spec\.dir\)\}`, title, open \}\);/.test(dw), 'installDesignWindow: card ⇒ the chat\'s card (key host|dir, the design\'s title) whose Open is the PERSON\'s door (app.openDesign: front + focus)');
  ok(/if \(existing\) \{ existing\._designRewatch\?\.\(\); app\.wm\.markArrived\(existing\.id\); \}/.test(dw), '…a window of that design already on the desk: its watch re-asserted (F3), its entry pulses — never revealed (no tab switch, no restore)');
  ok(/if \(quiet\) \{ app\.wm\.markArrived\(existing\.id\); app\.wm\.revealWindow\(existing\.id, \{ raise: false \}\); \}/.test(dw), 'openDesign: an agent\'s re-open of an OPEN design pulses + shows its tab, never raised (raise:false)');
  ok(/placeAgentWindow\(msg, open, card = null\) \{/.test(app) && /if \(p\.act === 'card'\) \{ this\.wm\.markArrived\(p\.fromWin\); if \(card\) card\(p\); return null; \}/.test(app), 'app.placeAgentWindow: card ⇒ NOTHING opens — the chat\'s badge + the caller\'s card');
  const ac = read('src/lib/agent-card.js');
  ok(/c\.card\.querySelector\('\.chat-agent-card-title'\)\.textContent = title;/.test(ac) && !/\.innerHTML = (?!UI_ICONS\.)/.test(ac), 'agent-card.js: the title lands through textContent (the agent\'s words); innerHTML only for the library\'s own icons');
  ok(/go\.addEventListener\('click', \(e\) => \{ e\.stopPropagation\(\); const run = c\.open; drop\(key\); if \(run\) run\(\); \}\);/.test(ac) && /let c = cards\.get\(key\);/.test(ac), '…Open runs the caller\'s door and removes the card; ONE card per key (a repeat re-pulses it)');
  ok(/inputArea\.prepend\(this\._agentCards\.el\);/.test(read('src/lib/chat-input.js')) && /showAgentCard\(card\) \{ return this\._chatInput\?\.showAgentCard\?\.\(card\) \|\| null; \}/.test(read('src/lib/chat-view.js')), 'chat-input.js draws the cards first in the input area; ChatView.showAgentCard is the door to them');
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
  ok(/opens beside the agent\\'s chat only while you are in that chat/.test(row) && /the chat gets a card and a taskbar badge, and the window opens when you press Open/.test(row), 'the description says the rule (lane agent-window-no-pop): beside only while you are in that chat, else a card + a badge, Open opens it');
  for (const lang of ['zh', 'ja']) { const L = read(`src/lib/i18n-${lang}.js`); ok(L.includes(', a Design it opens — opens beside the agent\'s chat only while you are in that chat'), `${lang}: the new rule is in the translated key`); ok(L.includes('"The agent wants to show you this design":') && L.includes('"Open the Design window":'), `${lang}: the card's words are translated`); }
}

console.log(failed ? `\nFAIL (${failed} failed, ${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
