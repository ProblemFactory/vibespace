#!/usr/bin/env node
// «LOCATE IN SIDEBAR» NEVER HIDES WHAT IT IS ASKED TO SHOW, AND FORK IS ON THE WINDOW'S MENU (lane think-tools-phone, 主开发
// 2026-11-17). The owner, with the row on screen and selected, pressed «Locate in sidebar» on a window's menu and got two toasts
// «条目不可见——可能已归档或被过滤»: «这哪里不可见了？»; and on the same menu: «另外右键菜单我怎么找不到fork». Fast tier, PURE (no DOM, no
// server, no browser): the product's own functions read off the source and run over models of the list and the rail.
//   ① THE VERDICT (src/locate-verdict.js): each reason in its place, the first filter that drops the row named, a collapsed
//      folder is no reason, every reason but «not in the list» has a door
//   ② THE LIST FILTERS WITH THE VERDICT (B-b842, 主开发 2026-11-19 — ONE predicate): `_renderInner` keeps no filter chain of its
//      own (it lists what sidebar.js `_filterSessions` shows, and `_filterSessions` judges every row with the verdict over
//      `_listRowFacts`, the builder Locate's `_locateFacts` uses too); the real `_filterSessions` and Locate's facts, run on fake
//      lists over the eight filters and both tabs, agree with the list's rules STATED here (the release's chain as a person
//      reads it, plus the stopped pill: rows, the first filter that drops one, and the counts the hints read); every door makes
//      progress; the pill's count (`_stoppedUnderFilters`) is the same predicate with the pill on. RED CONTROLS: a verdict without
//      the status filter, a verdict without its «all four» rule (seen only on a row of no known status), row facts that forget
//      the stopped pill.
//      (It replaced an oracle that sliced `_renderInner`'s own filter block out of the source: a second copy held equal by a test
//      that could not see a filter it was never told of — the stopped pill.)
//   ③ ONE SHOW DOOR: no `_railGo(` in src/ but the rail's own items and `_railShow`'s switch; the program callers go through
//      `_railShow`. RED CONTROL: the release's focusJobsPanel line put back
//   ④ LOCATE ON A MODEL OF THE RAIL AND THE LIST (the real `_railShow` / `_railGo` and the real Locate, read off the source): from
//      an open list, a collapsed sidebar, another panel and a folder far below the fold it ends OPEN on the sessions list with the
//      row flashed and no toast; a hidden row is said once with its door, and the door shows it; a list that never draws the row
//      ends at the bound with its own sentence. RED CONTROL = THE RELEASE'S LOCATE (2.369.407): an open list COLLAPSES and says
//      «not visible»; a closed one MISSES at 60 ms (the list's lazy folders are built by an IntersectionObserver, after a frame —
//      sidebar-render.js); it also looked for `.session-card`, a class no card wears
//   ⑤ THE TWO SESSION MENUS AGREE (scripts/lib/session-menu-parity.js): every card command has a row — on the window's menu, or not
//      applicable with its reason; the window's menu registers each named entry; Fork shows on both menus for the same
//      conversations (its condition is the session.fork command's). RED CONTROLS: the window's Fork row deleted, a card command
//      with no row, a window Fork row narrowed to live conversations
//   ⑥ THE WORDS: every sentence and door in zh and ja; the release's vague sentence is gone; no native dialog in Locate
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const { LOCATE_WORDS, LOCATE_ORDER, locateVerdict, NON_ARCHIVED } = require(path.join(REPO, 'src/locate-verdict.js'));
const { CARD_TO_WINDOW } = require(path.join(REPO, 'scripts/lib/session-menu-parity.js'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra ? '\n      ' + extra : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const J = JSON.stringify;
const cartesian = (...sets) => sets.reduce((acc, set) => acc.flatMap((a) => set.map((v) => [...a, v])), [[]]);

// a method of a class / an object literal, read off the source by its head line, up to the brace at the same indent
function methodText(src, head) {
  const i = src.indexOf(head);
  if (i < 0) throw new Error('cannot find «' + head.trim() + '»');
  const indent = head.match(/^ */)[0];
  const j = src.indexOf('\n' + indent + '}', i);
  if (j < 0) throw new Error('no closing brace for «' + head.trim() + '»');
  return src.slice(i, j + indent.length + 2).trim();
}
const asFunction = (text) => text.replace(/^(async\s+)?(\w+)\s*\(/, (m, a, n) => `${a || ''}function ${n}(`);

const SIDEBAR = read('src/lib/sidebar.js'), RAIL = read('src/lib/sidebar-rail.js'), LIFE = read('src/lib/session-lifecycle.js');
const ORDER = ['search', 'backend', 'host', 'kind', 'stopped', 'archived', 'status', 'view'];
const FOUR = ['live', 'tmux', 'external', 'stopped'];
const SHOWN = { present: true, term: '', matchesTerm: true, backend: 'claude', backendFilter: [], host: 'local', hostFilter: [], kindPass: true, stoppedOnly: false, stoppedBy: false, tasksTab: false, archived: false, showArchived: false, status: 'live', statusFilter: FOUR, activeView: null };

console.log('① THE VERDICT: each reason in its place, the first filter that drops the row');
{
  const V = (o) => locateVerdict({ ...SHOWN, ...o });
  const rows = [
    [{ present: false }, 'absent'], [{}, true], [{ term: 'zz', matchesTerm: false }, 'search'], [{ term: 'zz', matchesTerm: true }, true],
    [{ backendFilter: ['codex'] }, 'backend'], [{ backend: undefined, backendFilter: ['claude'] }, true], [{ host: undefined, hostFilter: ['h1'] }, 'host'],
    [{ host: 'h1', hostFilter: ['h1'] }, true], [{ kindPass: false }, 'kind'], [{ archived: true }, 'archived'], [{ archived: true, showArchived: true }, true],
    [{ showArchived: true, statusFilter: ['archived'] }, 'status'], [{ showArchived: true, statusFilter: ['archived', 'live'] }, true],
    [{ statusFilter: ['stopped'] }, 'status'], [{ statusFilter: [] }, 'status'], [{ status: 'stopped', statusFilter: FOUR }, true],
    [{ activeView: 'stopped' }, 'view'], [{ activeView: 'live' }, true], [{ collapsedFolder: true, folderFarBelow: true }, true],
    [{ term: 'zz', matchesTerm: false, archived: true, activeView: 'stopped' }, 'search'], [{ backendFilter: ['codex'], kindPass: false, archived: true }, 'backend'],
    // B-b842: the stopped pill (never on the Tasks board) and the Tasks board (only Archived narrows it)
    [{ stoppedOnly: true }, 'stopped'], [{ stoppedOnly: true, stoppedBy: true }, true], [{ stoppedOnly: true, tasksTab: true }, true],
    [{ kindPass: false, stoppedOnly: true }, 'kind'], [{ stoppedOnly: true, archived: true, statusFilter: ['stopped'] }, 'stopped'],
    [{ tasksTab: true, statusFilter: ['stopped'], activeView: 'stopped' }, true], [{ tasksTab: true, archived: true }, 'archived'], [{ tasksTab: true, archived: true, showArchived: true }, true],
    // 主开发's read of B-b842 (04:09Z): ONE status rule, Archived on or off — all four on never narrows (a row of no known status
    // included); the list's once-a-draw array of the statuses on (statusOn) is what the verdict reads when it is given
    [{ showArchived: true, statusFilter: [...FOUR, 'archived'], status: undefined }, true], [{ showArchived: true, statusFilter: ['live', 'archived'], status: undefined }, 'status'],
    [{ statusFilter: FOUR, statusOn: ['live'], status: 'stopped' }, 'status'], [{ statusFilter: ['live'], statusOn: FOUR, status: 'stopped' }, true],
  ];
  const bad = rows.filter(([o, want]) => { const v = V(o); return want === true ? v.show !== true : (v.show !== false || v.why !== want); });
  ok(!bad.length, `${rows.length} rows: every reason where the list puts it, the FIRST filter that drops the row named, a row in a collapsed or far folder shown`, bad.map(([o]) => J(o) + ' → ' + J(V(o))).join(' | '));
  ok(V({ term: 'Zz', matchesTerm: false }).term === 'Zz' && V({ statusFilter: ['live'], status: 'stopped' }).name === 'stopped' && V({ activeView: 'live', status: 'tmux' }).name === 'live' && V({ backendFilter: ['codex'] }).name === 'claude' && V({ hostFilter: ['h1'] }).name === 'local',
    'the reason carries what the sentence names: the words searched, the status, the view, the agent, the location');
  ok(J(LOCATE_ORDER) === J(ORDER) && verdictOf(Object.isFrozen(LOCATE_ORDER)), `the module's order is the list's: ${ORDER.join(' → ')}`, J(LOCATE_ORDER));
  ok(J(Object.keys(LOCATE_WORDS).sort()) === J(['absent', ...ORDER].sort()) && !('folder' in LOCATE_WORDS) && verdictOf(Object.isFrozen(LOCATE_WORDS)),
    'one sentence per reason — and none for a folder (a collapsed folder is opened, never a reason)');
  ok(gateOf(ORDER.every((k) => typeof LOCATE_WORDS[k].door === 'string' && LOCATE_WORDS[k].door.length > 3)) && LOCATE_WORDS.absent.door === null,
    'every reason the sidebar can undo names its door; only «not in the list» has none (nothing in the sidebar can show it)');
  ok(NON_ARCHIVED === FOUR.length, `the status filter narrows only below all ${FOUR.length} non-archived statuses (the list's own rule)`);
}

console.log('② THE LIST FILTERS WITH THE VERDICT (B-b842): one predicate — sidebar.js _filterSessions judges every row with it, Locate reads the same facts');
{
  const RI = methodText(SIDEBAR, '  _renderInner() {'), FS = methodText(SIDEBAR, '  _filterSessions(term) {'), LF = methodText(SIDEBAR, '  _locateFacts(sessionId) {'), RF = methodText(SIDEBAR, '  _listRowFacts(s, ctx) {');
  // (a) THE WIRING — the list keeps no chain of its own
  const OWN = ['sessionMatchesFilter(', 'passesAgentKindFilter(', 'isStoppedBy(', 'this._backendFilter.has(', 'this._hostFilter.has(', 'nonArchivedFilters', '=== this._activeView', 'this.isArchived('];   // stale-pins: kept — an ABSENCE census: the release chain's matchers, which _renderInner must no longer hold
  ok(gateOf(/const filtered = this\._filterSessions\(f\);\n\s*let sessions = filtered\.sessions;/.test(RI)) && verdictOf(OWN.every((k) => !RI.includes(k))), `_renderInner lists what _filterSessions shows and holds no matcher of its own (${OWN.length} named) — the second copy of the chain is gone`, OWN.filter((k) => RI.includes(k)).join(' · '));
  ok(gateOf(/const v = locateVerdict\(this\._listRowFacts\(s, ctx\)\);/.test(FS)) && gateOf(/if \(v\.show\) sessions\.push\(s\);/.test(FS)) && verdictOf(/for \(const s of this\._allSessions \|\| \[\]\)/.test(FS)), '_filterSessions judges EVERY row with the verdict over _listRowFacts and lists exactly what it shows');
  ok(verdictOf(/return this\._listRowFacts\(s, this\._listFilterCtx\(/.test(LF)), 'Locate\'s facts come from the SAME builder (_locateFacts → _listRowFacts over _listFilterCtx)');
  ok(gateOf(/statusOn: \[\.\.\.this\._statusFilter\]\.filter\(\(x\) => x !== 'archived'\)/.test(methodText(SIDEBAR, '  _listFilterCtx(term) {'))) && gateOf(/statusOn: ctx\.statusOn/.test(RF)) && verdictOf(/Array\.isArray\(f\.statusOn\) \? f\.statusOn :/.test(read('src/locate-verdict.js'))),
    'the statuses on are built ONCE a draw (_listFilterCtx) and handed to every row (_listRowFacts) — never an array a row a draw (主开发 04:09Z)');
  ok(verdictOf(['sessionMatchesFilter(s, ctx.term)', 'passesAgentKindFilter(s, ctx.kindFilter)', 'isStoppedBy(s)', 'this.isArchived(s)'].every((k) => RF.includes(k))), 'the row facts ask the list\'s own matchers: the search box\'s, the agent kind\'s, the stopped pill\'s, Archived');
  const SU = methodText(SIDEBAR, '  _stoppedUnderFilters() {');
  ok(gateOf(/stoppedOnly: true \};/.test(SU)) && gateOf(/isStoppedBy\(s\) && locateVerdict\(this\._listRowFacts\(s, ctx\)\)\.show/.test(SU)) && !/sessionMatchesFilter\(|_statusFilter|_activeView|_backendFilter|_hostFilter/.test(SU), 'the pill\'s count (_stoppedUnderFilters) is the same predicate with the pill on — no third copy of the chain');
  // (b) THE BEHAVIOUR, against the list's rules STATED here: the release's chain as a person reads it (the search box, the agent,
  // the location, the kind, the stopped pill — never on the Tasks board —, then the Tasks board narrows by Archived alone;
  // elsewhere Archived / the status filter, narrowing only below all four / the quick view), with the counts the hints read
  const SPEC = (fk, term) => {
    let ss = fk._allSessions, drop = null;
    const step = (why, keep) => { const before = ss.some((x) => x.sessionId === 'c1'); ss = ss.filter(keep); if (before && !drop && !ss.some((x) => x.sessionId === 'c1')) drop = why; };
    if (term) step('search', (x) => x._match);
    if (fk._backendFilter.size) step('backend', (x) => fk._backendFilter.has(x.backend || 'claude'));
    if (fk._hostFilter.size) step('host', (x) => fk._hostFilter.has(x.host || 'local'));
    if (fk._agentKindFilter) step('kind', (x) => x._kind);
    if (fk._stoppedOnly && fk._activeTab !== 'tasks') step('stopped', (x) => x._stopped);
    const searched = ss.length; let statusLeft = null, archivedHid = 0;
    const showArchived = fk._statusFilter.has('archived');
    if (fk._activeTab === 'tasks') { if (!showArchived) step('archived', (x) => !x._arch); }
    else {
      const on = new Set(fk._statusFilter); on.delete('archived');   // the status filter narrows only below all four — Archived on or off (主开发 04:09Z)
      if (showArchived) { if (on.size < 4) step('status', (x) => x._arch || on.has(x.status)); }
      else {
        const n0 = ss.length; step('archived', (x) => !x._arch); archivedHid = n0 - ss.length;
        if (on.size < 4) step('status', (x) => on.has(x.status));
      }
      statusLeft = ss.length;
      if (fk._activeView) step('view', (x) => x.status === fk._activeView);
    }
    return { ids: ss.map((x) => x.sessionId).join(), rows: ss, searched, statusLeft, archivedHid, drop };
  };
  const env = { term: '' };
  const doc = { getElementById: (id) => (id === 'session-filter' ? { get value() { return env.term; }, set value(v) { env.term = v; } } : null) };
  const scope = ['document', 'sessionMatchesFilter', 'passesAgentKindFilter', 'isStoppedBy', 'locateVerdict', 'localStorage', 'sessionStorage', 'getBackendMeta', 'tr'];
  const store = { setItem() {}, getItem: () => null };
  const argsWith = (verdict) => [doc, (x) => !!x._match, (x, k) => !k || !!x._kind, (x) => !!x._stopped, verdict, store, store, (bk) => ({ label: bk }), (t) => t];
  const bindText = (text, verdict = locateVerdict) => new Function(...scope, 'return ' + asFunction(text))(...argsWith(verdict));
  const bind = (head, verdict) => bindText(methodText(SIDEBAR, head), verdict);
  const FACTS = bind('  _locateFacts(sessionId) {'), DOOR = bind('  _locateDoor(why) {'), ALLKINDS = bind('  _showAllAgentKinds() {');
  const CTX = bind('  _listFilterCtx(term) {'), ROWF = bindText(RF), FILTER = bind('  _filterSessions(term) {'), PILL = bindText(SU);
  const fakeOf = (st, m = {}) => ({ _allSessions: st.more ? [st.more[0], st.s, ...st.more.slice(1)] : [st.s], _backendFilter: new Set(st.bf), _hostFilter: new Set(st.hf), _agentKindFilter: st.kf, _stoppedOnly: st.so, _statusFilter: new Set(st.sf), _activeTab: st.tab, _activeView: st.av,
    _listFilterCtx: CTX, _listRowFacts: m.rowFacts || ROWF, _filterSessions: m.filter || FILTER,
    isArchived: (x) => !!x._arch, _updateBackendFilterBtn() {}, _updateFilterBtn() {}, _saveListFilters() {}, _render() {}, _renderAgentKindQuickTabs() {}, _renderStoppedQuickTab() {}, _renderQuickTabs() {}, _showAllAgentKinds() { return ALLKINDS.call(this); } });
  const MORE = [{ sessionId: 'c0', _match: true, backend: 'codex', host: 'h1', _kind: false, _arch: false, status: 'tmux', _stopped: true },
    { sessionId: 'c2', _match: false, _kind: true, _arch: true, status: 'stopped', _stopped: false }, { sessionId: 'c3', _match: true, _kind: true, _arch: false, status: 'external', _stopped: true }];
  const states = [];
  for (const [[term, m], [backend, bf], [host, hf], [kf, kp], arch, sf, status, av, so, stopped, tab] of cartesian([['', true], ['zz', true], ['zz', false]], [[undefined, []], [undefined, ['claude']], [undefined, ['codex']], ['codex', ['codex']]],
    [[undefined, []], [undefined, ['local']], ['h1', ['local']]], [[null, true], ['primary', true], ['primary', false]], [false, true], [FOUR, [...FOUR, 'archived'], ['live'], ['live', 'archived'], []], ['live', 'stopped'], [null, 'live'],
    [false, true], [false, true], ['folders', 'tasks'])) {
    states.push({ term, s: { sessionId: 'c1', _match: m, backend, host, _kind: kp, _arch: arch, status, _stopped: stopped }, more: MORE, bf, hf, kf, so, sf, av, tab });
  }
  const run = ({ verdict = locateVerdict, filter = FILTER, rowFacts = ROWF, first = false } = {}) => {   // first: a control stops at its first disagreement
    let n = 0, shown = 0, bad = null; const whys = new Set();
    for (const st of states) {
      env.term = st.term; const fk = fakeOf(st, { filter, rowFacts });
      const want = SPEC(fk, st.term), got = filter.call(fk, st.term), v = verdict(FACTS.call(fk, 'c1'));   // Locate's own road: the search words read from the box
      n++; if (v.show) shown++; else whys.add(v.why);
      const ids = got.sessions.map((x) => x.sessionId).join(), inList = want.rows.some((x) => x.sessionId === 'c1');
      const pill = st.pill === false ? null : PILL.call(fk).map((x) => x.sessionId).join(), wantPill = st.pill === false ? null : SPEC({ ...fk, _stoppedOnly: true }, st.term).rows.filter((x) => x._stopped).map((x) => x.sessionId).join();
      const agree = ids === want.ids && got.searched === want.searched && got.statusLeft === want.statusLeft && got.archivedHid === want.archivedHid && !!v.show === inList && (v.show || v.why === want.drop) && pill === wantPill;
      if (!agree && !bad && (bad = { st: { ...st, s: undefined, more: undefined, ...st.s }, want: { ...want, rows: undefined }, got: { ids, searched: got.searched, statusLeft: got.statusLeft, archivedHid: got.archivedHid }, v, pill, wantPill }) && first) break;
    }
    return { n, shown, whys, bad };
  };
  const R = run();
  ok(!R.bad, `over ${R.n} states (the eight filters, both tabs, four rows a list) the list draws the rows the rules say in their order, with the same counts; Locate (reading the search box) says «shown» exactly then — else the FIRST filter that drops it; the pill counts what a press shows (${R.shown} shown)`, R.bad && J(R.bad));
  ok(R.shown > 0 && R.shown < R.n && verdictOf(ORDER.every((k) => R.whys.has(k))), `…and the matrix reaches every reason (${[...R.whys].join(', ')})`);
  // every door makes progress: pressed, the row shows or the next reason is a LATER one — a present row shows within the order's length
  let worst = 0, stuck = null;
  for (const st of states) {
    env.term = st.term; const fk = fakeOf({ ...st, bf: [...st.bf], hf: [...st.hf], sf: [...st.sf] });
    let v = locateVerdict(FACTS.call(fk, 'c1')), presses = 0;
    while (!v.show && presses < ORDER.length + 1) {
      DOOR.call(fk, v.why); presses++;
      const next = locateVerdict(FACTS.call(fk, 'c1'));
      if (!next.show && ORDER.indexOf(next.why) <= ORDER.indexOf(v.why)) { stuck = stuck || { st: J({ ...st, s: undefined, ...st.s }), why: v.why, next: next.why }; break; }
      v = next;
    }
    if (!v.show && !stuck) stuck = { st: J({ ...st, s: undefined, more: undefined, ...st.s }), why: v.why, presses };
    if (v.show && !FILTER.call(fk, env.term).sessions.some((x) => x.sessionId === 'c1') && !stuck) stuck = { st: J({ ...st, s: undefined, ...st.s }), door: 'the verdict says shown, the list does not draw it' };
    worst = Math.max(worst, presses);
  }
  ok(!stuck && worst <= ORDER.length, `every door shows the row or moves it to a LATER reason; every present row is shown within ${worst} presses, and the list then draws it`, stuck && J(stuck));
  // RED CONTROLS: the stated rules must be able to disagree with the product
  const noStatus = (fx) => { const v = locateVerdict(fx); return (!v.show && v.why === 'status') ? { show: true } : v; };
  const C1 = run({ verdict: noStatus, filter: bind('  _filterSessions(term) {', noStatus), first: true });
  ok(!!C1.bad, `RED CONTROL: a verdict without the status filter — the list (it filters with it) and Locate both disagree with the rules (${C1.bad ? 'listed ' + C1.bad.got.ids + ' vs ' + C1.bad.want.ids : 'NOT CAUGHT'})`);
  // THE «ALL FOUR» RULE (the status filter narrows only below all four non-archived statuses) changes nothing for a row of one of the
  // four — it is seen only on a row whose status the list does not know: kept while all four are on, dropped once the person narrows
  const VSRC = read('src/locate-verdict.js'), VSRC0 = editAnchor(VSRC, 'const narrows = on.length < NON_ARCHIVED;', 'const narrows = true;', "src/locate-verdict.js");
  const always = VSRC0 !== VSRC ? new Function('module', VSRC0 + '\nreturn module.exports;')({ exports: {} }).locateVerdict : null;
  const unknown = cartesian([FOUR, ['live'], [...FOUR, 'archived'], ['live', 'archived']], [false, true], ['folders', 'tasks']).map(([sf, arch, tab]) => ({ term: '', s: { sessionId: 'c1', _match: true, _kind: true, _arch: arch, status: undefined, _stopped: false }, more: MORE, bf: [], hf: [], kf: null, so: false, sf, av: null, tab, pill: false }));
  const keep = states.splice(0, states.length, ...unknown);
  const U = run(), C3 = always ? run({ verdict: always, filter: bind('  _filterSessions(term) {', always) }) : { bad: null };
  states.splice(0, states.length, ...keep);
  ok(!U.bad && U.shown > 0 && U.shown < U.n, `a row of no known status: kept while all four are on, dropped once the person narrows — the list and Locate agree with the rules (${U.shown} of ${U.n} shown)`, U.bad && J(U.bad));
  ok(!!always && !!C3.bad, 'RED CONTROL: a verdict without its «all four» rule (it always narrows) drops that row while all four are on — the rules disagree', C3.bad && J(C3.bad.want));
  // …and THE DOOR SHOWS IT (主开发 04:09Z: with Archived on, «Show every status» added the four and the row of no known status stayed
  // hidden — the next press found the same reason): over those rows, every door shows the row or moves it to a LATER reason
  const doorsShow = (verdict) => { let stuck = null;
    for (const st of unknown) {
      env.term = st.term; const fk = fakeOf({ ...st, bf: [...st.bf], hf: [...st.hf], sf: [...st.sf] });
      let v = verdict(FACTS.call(fk, 'c1')), presses = 0;
      while (!v.show && presses < ORDER.length + 1) {
        DOOR.call(fk, v.why); presses++;
        const next = verdict(FACTS.call(fk, 'c1'));
        if (!next.show && ORDER.indexOf(next.why) <= ORDER.indexOf(v.why)) { stuck = stuck || { sf: st.sf, arch: st.s._arch, tab: st.tab, why: v.why, next: next.why }; break; }
        v = next;
      }
    }
    return stuck; };
  const D0 = doorsShow(locateVerdict);
  ok(!D0, 'a row of no known status: every door shows it or moves it to a LATER reason — Archived on included («Show every status» is enough)', D0 && J(D0));
  const baseArch = (fx) => (fx && fx.present && !fx.tasksTab && fx.showArchived && !fx.archived && !(fx.statusFilter || []).includes(fx.status) && locateVerdict(fx).show !== false ? { show: false, why: 'status', name: fx.status } : locateVerdict(fx));
  const D1 = doorsShow(baseArch);
  ok(!!D1 && D1.why === 'status' && D1.next === 'status', 'RED CONTROL: the base\'s rule (Archived on: no «all four» exception) — «Show every status» leaves that row hidden and the next press finds the same reason', D1 && J(D1));
  const RF0 = RF.replace('stoppedBy: ctx.stoppedOnly ? isStoppedBy(s) : false', 'stoppedBy: true');
  const C2 = RF0 !== RF ? run({ rowFacts: bindText(RF0), first: true }) : { bad: null };
  ok(RF0 !== RF && !!C2.bad, 'RED CONTROL: row facts that forget the stopped pill (the release\'s blind spot — every row «stopped») disagree with the rules', C2.bad && J(C2.bad.want));
}

console.log('③ ONE SHOW DOOR: a program never goes through the rail\'s re-click');
{
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(m?js|cjs)$/.test(e.name)) files.push(p); } };
  walk('src');
  const code = (line) => { const t = line.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : line.replace(/\/\/.*$/, ''); };
  const census = (text, file) => text.split('\n').map((l, i) => ({ file, n: i + 1, l: code(l) })).filter((x) => /_railGo\s*(\?\.)?\s*\(/.test(x.l))
    .filter((x) => !(file === 'src/lib/sidebar-rail.js' && (/^\s*item\('(\w+)', tr\('[^']+'\), \(\) => this\._railGo\('\1'\)\),$/.test(x.l) || /^\s*_railGo\(id\) \{$/.test(x.l) || /^\s*if \(this\._railEl\) \{ this\._railGo\(id\); return; \}/.test(x.l))));
  const all = files.flatMap((f) => census(fs.readFileSync(path.join(REPO, f), 'utf-8'), f));
  ok(files.length > 250 && !all.length, `no \`_railGo(\` in ${files.length} src files but the rail's own items and _railShow's switch${all.length ? ' — ' + all.map((x) => `${x.file}:${x.n} ${x.l.trim()}`).join(' | ') : ''}`);
  const items = RAIL.split('\n').filter((l) => /^\s*item\('(\w+)', tr\('[^']+'\), \(\) => this\._railGo\('\1'\)\),$/.test(l)).length;
  ok(items >= 9, `the rail's own items keep their re-click (${items} items: a person's second click on the open tab collapses it)`);
  const callers = files.filter((f) => /\._railShow\??\.?\(/.test(fs.readFileSync(path.join(REPO, f), 'utf-8')));
  const want = ['src/lib/sidebar-rail.js', 'src/lib/jobs-panel.js', 'src/lib/channels-panel.js', 'src/lib/manage-agents.js', 'src/lib/plugins-ui.js', 'src/lib/session-lifecycle.js'];
  ok(verdictOf(want.every((f) => callers.includes(f))), `every program caller moved to the show door (${callers.join(', ')})`);
  const jobs = fs.readFileSync(path.join(REPO, 'src/lib/jobs-panel.js'), 'utf-8');
  const planted = jobs.replace("sb._railShow('jobs');", "sb._railGo('jobs');");
  ok(planted !== jobs && census(planted, 'src/lib/jobs-panel.js').length === 1, 'RED CONTROL: the release\'s focusJobsPanel line (`sb._railGo(\'jobs\')`) put back is caught');
  const plantedOpt = jobs.replace("sb._railShow('jobs');", "sb._railGo?.('jobs');");
  ok(plantedOpt !== jobs && census(plantedOpt, 'src/lib/jobs-panel.js').length === 1, 'RED CONTROL: the optional call (`sb._railGo?.(\'jobs\')` — the form two release sites wore) is caught too');
}

console.log('④ LOCATE ON A MODEL OF THE RAIL AND THE LIST — the release\'s Locate as the red control');
const RELEASE_LOCATE = `locateSessionInSidebar(backendSessionId) {
    const sb = this.sidebar;
    if (!sb || !backendSessionId) return;
    try { sb._railGo?.('folders'); } catch { }
    try { if (sb._activeTab !== 'folders') { sb._activeTab = 'folders'; sb.render?.(); } } catch { }
    setTimeout(() => {
      const card = [...document.querySelectorAll('.session-card')].find((c) => c._sessionId === backendSessionId);
      if (!card) { showToast(t('Entry not visible — it may be archived or filtered out')); return; }
      const group = card.closest('.folder-group');
      if (group?.classList.contains('collapsed')) group.classList.remove('collapsed');
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.add('locate-flash');
      setTimeout(() => card.classList.remove('locate-flash'), 2400);
    }, 60);
  }`;   // 2.369.407 (b06f36e90) src/lib/session-lifecycle.js, verbatim
{
  const LOCATE = methodText(LIFE, '  async locateSessionInSidebar(backendSessionId) {');
  const WAIT = Number((LIFE.match(/const LOCATE_WAIT_MS = (\d+);/) || [])[1]);
  ok(WAIT > 0 && gateOf(/LOCATE_WAIT_MS/.test(LOCATE)) && gateOf(/_railShow\?\.\('folders'\)/.test(LOCATE)) && !/_railGo/.test(LOCATE) && gateOf(/\.session-item-card/.test(LOCATE)) && !/\.session-card'/.test(LOCATE),
    `Locate goes through the show door, looks for the card's real class and waits on a bound (LOCATE_WAIT_MS = ${WAIT})`);
  const railObj = (() => { const s = RAIL.indexOf('    _railShow(id) {'), e = RAIL.indexOf('    _railSync() {', s); return s > 0 && e > s ? RAIL.slice(s, e) : ''; })();
  ok(gateOf(/_railShow\(id\) \{/.test(railObj)) && verdictOf(/_railGo\(id\) \{/.test(railObj)), 'the real _railShow and _railGo are read off sidebar-rail.js');
  const store = { setItem() {}, getItem: () => null };
  const RAILM = new Function('localStorage', 'track', `return ({ ${railObj} });`)(store, () => {});
  // TODAY'S DOOR (主开发's must, its red control): the show door that clears a drill-down but does not draw the list again
  const DRILL_REDRAW = ' if (hadDrill) this._render?.();';
  const WB0 = read('src/lib/sidebar-workbench.js');
  const SWITCH_BACK = (() => { const a = WB0.indexOf('    _locateSwitchBack(sw) {'); return a < 0 ? null : new Function('return ({ ' + WB0.slice(a, WB0.indexOf('\n', a)) + ' })')()._locateSwitchBack; })();
  const RAILM_NO_REDRAW = railObj.includes(DRILL_REDRAW) ? new Function('localStorage', 'track', `return ({ ${railObj.replace(DRILL_REDRAW, '')} });`)(store, () => {}) : null;
  const FRAME = 16;
  // THE MODEL OF THE SESSIONS TAB (the adversarial read: it is the WORKBENCH — zones, built at once by _render): a row is on a card
  // only while its ZONE is drawn (Recent within its project's five, History open, this machine's list); `zone: 'closed'` = a row
  // the list holds and no zone draws until _openZoneOf opens it
  const world = ({ open, tab, zone = 'drawn', facts = SHOWN, never = false, phone = false, drill = false, rail = RAILM, switched = null }) => {
    const W = { ms: 0, q: [], n: 0, toasts: [], actions: [], flashes: 0, frames: 0, facts: { ...facts } };
    W.later = (fn, d) => W.q.push({ due: W.ms + Math.max(0, d || 0), k: ++W.n, fn });
    const card = { _sessionId: 'c1', classList: { add: (c) => { if (c === 'locate-flash') W.flashes++; }, remove() {}, contains: () => false }, scrollIntoView() { W.scrolled = (W.scrolled || 0) + 1; }, closest: () => null };
    const sb = Object.assign(Object.create(rail), {
      isOpen: open, _activeTab: tab, _railEl: phone ? null : {}, _panelDispose: null, zoneOpen: zone === 'drawn', drawn: zone === 'drawn',
      _mobileDrilldown: drill ? { type: 'group', id: 'g1' } : null, drillShown: drill,   // the phone: a Task Group's detail drawn on the Sessions tab
      toggle(f) { this.isOpen = f !== undefined ? f : !this.isOpen; },
      _updateTabs() {}, _railSync() {}, _railApplyTitle() {},
      _render() { this.drawn = this.zoneOpen; this.drillShown = !!this._mobileDrilldown; },   // the workbench builds every zone's cards at once (a drill-down draws the group instead)
      render() { this._render(); },
      _openZoneOf() { if (never || this.zoneOpen) return false; this.zoneOpen = true; if (switched) (this._locateSwitched = this._locateSwitched || []).push(switched); return 'render'; },
      _wbRecentHost: '', _wbHistoryHost: '', _locateSwitchBack: SWITCH_BACK,   // the workbench's own switch-back
      _openFolderOf() { return false; },   // no grouped view on this tab
      _locateFacts: () => W.facts, _locateName: (why, name) => name,
      _locateDoor(why) { W.doors = [...(W.doors || []), why]; W.facts = { ...SHOWN }; },
    });
    const cards = () => (sb.isOpen && sb._activeTab === 'folders' && sb.zoneOpen && sb.drawn && !sb.drillShown && !never ? [card] : []);
    sb.listEl = { l: {}, querySelectorAll: (sel) => (sel === '.session-item-card' ? cards() : []), addEventListener(e, f) { (this.l[e] = this.l[e] || []).push(f); }, removeEventListener(e, f) { this.l[e] = (this.l[e] || []).filter((x) => x !== f); } };
    W.person = (e) => (sb.listEl.l[e] || []).forEach((f) => f());   // the person's own input in the list
    W.sb = sb;
    W.search = { l: [], addEventListener(e, f) { if (e === 'input') this.l.push(f); }, removeEventListener(e, f) { this.l = this.l.filter((x) => x !== f); } };
    W.doc = { visibilityState: 'visible', querySelectorAll: (sel) => (sel === '.session-item-card' ? cards() : []), getElementById: (id) => (id === 'session-filter' ? W.search : null) };
    W.showToast = (words, o = {}) => { W.toasts.push(words); if (o.action) W.actions.push(o.action); };
    W.raf = (fn) => { W.frames++; W.later(fn, FRAME); };
    W.drain = async () => { for (let i = 0; i < 100000; i++) { await new Promise((r) => setImmediate(r)); if (!W.q.length) return; W.q.sort((x, y) => x.due - y.due || x.k - y.k); const nx = W.q.shift(); W.ms = nx.due; nx.fn(); } };
    return W;
  };
  const bindLocate = (text, W) => new Function('document', 'showToast', 't', 'setTimeout', 'requestAnimationFrame', 'Date', 'locateVerdict', 'LOCATE_WORDS', 'LOCATE_WAIT_MS',
    'return ' + asFunction(text))(W.doc, W.showToast, (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s), W.later, W.raf, { now: () => W.ms }, locateVerdict, LOCATE_WORDS, WAIT);
  const press = async (text, W) => { const app = { sidebar: W.sb }; const fn = bindLocate(text, W); app.locateSessionInSidebar = fn; const done = fn.call(app, 'c1'); await W.drain(); await done; return { open: W.sb.isOpen, tab: W.sb._activeTab, flashes: W.flashes, toasts: W.toasts.slice() }; };
  const shown = (r) => r.open && r.tab === 'folders' && r.flashes === 1 && !r.toasts.length;
  const FIXED_CLASS = RELEASE_LOCATE.replace("'.session-card'", "'.session-item-card'");
  const SCENES = [
    ['an OPEN sessions list, the row on screen (the owner\'s case)', { open: true, tab: 'folders' }],
    ['a COLLAPSED sidebar', { open: false, tab: 'folders' }],
    ['another panel open (Ports)', { open: true, tab: 'ports' }],
    ['a collapsed sidebar left on another panel (Background Work)', { open: false, tab: 'jobs' }],
    ['a row in a CLOSED ZONE (History closed, past its project\'s five, another machine\'s list) on an open list', { open: true, tab: 'folders', zone: 'closed' }],
    ['THE OWNER\'S CASE: a collapsed sidebar AND the row in a closed zone', { open: false, tab: 'folders', zone: 'closed' }],
  ];
  for (const [name, w] of SCENES) {
    const r = await press(LOCATE, world(w));
    ok(verdictOf(shown(r)), `Locate from ${name}: open on the sessions list, the row flashed, no toast`, J(r));
  }
  const rel = await press(RELEASE_LOCATE, world(SCENES[0][1]));
  ok(!rel.open && rel.toasts.length === 1 && verdictOf(/Entry not visible/.test(rel.toasts[0])), `RED CONTROL (the release's Locate, verbatim) on the owner's open list: the list COLLAPSES and it says «not visible» (${J(rel)})`);
  const relOpen = await press(FIXED_CLASS, world(SCENES[0][1]));
  ok(!relOpen.open && relOpen.toasts.length === 1, `RED CONTROL (the release's Locate with the card's class corrected): an open list still collapses (${J(relOpen)})`);
  const relClosed = await press(FIXED_CLASS, world(SCENES[5][1]));
  ok(gateOf(relClosed.open) && relClosed.flashes === 0 && relClosed.toasts.length === 1, `RED CONTROL (class corrected) on the owner's case: the sidebar opens, it looks once at 60 ms, and a row in a closed zone is never found — nothing opens the zone (${J(relClosed)})`);
  // a hidden row: said once, with its door; the door shows it
  const Wh = world({ open: true, tab: 'folders', facts: { ...SHOWN, term: 'zz', matchesTerm: false } });
  const h = await press(LOCATE, Wh);
  ok(gateOf(h.open) && h.flashes === 0 && J(h.toasts) === J(['Hidden by the search box: «zz»']) && Wh.actions.length === 1 && Wh.actions[0].label === 'Clear search',
    `a row hidden by the search box: one toast naming the words searched, with its door «Clear search», and the list stays open (${J(h)})`);
  Wh.actions[0].run(); await Wh.drain();
  ok(J(Wh.doors) === J(['search']) && Wh.flashes === 1 && Wh.toasts.length === 1, '…the door clears the search and the row is located and flashed, no second toast');
  for (const [why, o] of [['archived', { archived: true }], ['status', { statusFilter: ['stopped'] }], ['view', { activeView: 'stopped' }], ['kind', { kindPass: false }], ['stopped', { stoppedOnly: true }]]) {
    const Wx = world({ open: true, tab: 'folders', facts: { ...SHOWN, ...o } });
    const x = await press(LOCATE, Wx);
    ok(gateOf(x.open) && x.toasts.length === 1 && Wx.actions.length === 1 && Wx.actions[0].label === LOCATE_WORDS[why].door, `a row hidden by «${why}»: said once with its door «${LOCATE_WORDS[why].door}», the list open`, J(x));
  }
  const Wa = world({ open: true, tab: 'folders', facts: { present: false } });
  const ab = await press(LOCATE, Wa);
  ok(J(ab.toasts) === J([LOCATE_WORDS.absent.words]) && !Wa.actions.length && verdictOf(ab.open), 'a conversation not in the list: said in those words, no door offered, the list open');
  // the wait is bounded: a list that never draws the row ends at the bound with its own sentence (never «not visible», never a loop)
  const Wn = world({ open: true, tab: 'folders', never: true });
  const nv = await press(LOCATE, Wn);
  const framesAtBound = Math.round(WAIT / FRAME);
  ok(nv.toasts.length === 1 && gateOf(/did not draw this conversation in time/.test(nv.toasts[0])) && Wn.q.length === 0 && Wn.frames >= framesAtBound && Wn.frames <= framesAtBound + 2,
    `a list that never draws the row: the wait ends at its bound (${Wn.frames} frames of ${FRAME} model ms ≈ LOCATE_WAIT_MS) with its own sentence, nothing left running`, J({ nv, frames: Wn.frames }));

  // THE MUST (主开发's verdict): ON A PHONE, after a Task Group was opened, the Sessions tab still draws its detail; Locate on a LIVE row
  // outside it — the show door clears the drill-down and DRAWS the list again (the tab already being Sessions)
  const ph = await press(LOCATE, world({ open: true, tab: 'folders', phone: true, drill: true }));
  ok(verdictOf(shown(ph)), `THE MUST — a phone, a Task Group's detail left on the Sessions tab, Locate on a live row outside it: the list drawn again, the row flashed, no toast (${J(ph)})`, ph);
  const phRed = RAILM_NO_REDRAW && await press(LOCATE, world({ open: true, tab: 'folders', phone: true, drill: true, rail: RAILM_NO_REDRAW }));
  ok(!!phRed && phRed.flashes === 0 && phRed.toasts.length === 1 && verdictOf(/did not draw this conversation in time/.test(phRed.toasts[0])), `RED CONTROL — today's door (the drill-down cleared, nothing drawn): the stale detail stays and Locate times out (${J(phRed)})`, phRed);
  // THE WAIT ENDS WHEN THE PERSON WALKS AWAY: closed, another tab, their own scroll — silently
  const WALKS = [['closes the list', (w) => w.sb.toggle(false)], ['chooses another tab', (w) => { w.sb._activeTab = 'ports'; }],
    ['scrolls the list (wheel)', (w) => w.person('wheel')], ['touches the list', (w) => w.person('touchstart')], ['presses a key in the list', (w) => w.person('keydown')],
    ['presses in the list', (w) => w.person('pointerdown')], ['types a search', (w) => w.search.l.forEach((f) => f())], ['hides the browser tab', (w) => { w.doc.visibilityState = 'hidden'; }]];
  for (const [name, act] of WALKS) {
    const Wk = world({ open: true, tab: 'folders', never: true });
    Wk.later(() => act(Wk), 200);
    const r = await press(LOCATE, Wk);
    const left = Object.values(Wk.sb.listEl.l).reduce((n, xs) => n + xs.length, 0) + Wk.search.l.length;
    ok(r.toasts.length === 0 && Wk.frames < 30 && left === 0, `the person ${name} during the wait: Locate ends at once, SILENTLY, its listeners gone (${Wk.frames} frames, ${r.toasts.length} toasts, ${left} left)`, r);
  }
  // WHAT LOCATE OPENED IS SAID: a switcher it moved off another machine names what it showed, with the way back (the REAL switch-back)
  const Ws = world({ open: true, tab: 'folders', zone: 'closed', switched: { zone: 'recent', host: 'h1', name: 'Box' } });
  const sw = await press(LOCATE, Ws);
  ok(sw.flashes === 1 && sw.toasts.length === 1 && gateOf(/^Recent now shows Local, to find this conversation \(it showed Box\)$/.test(sw.toasts[0])) && Ws.actions[0]?.label === 'Show Box again',
    `a Recent switcher moved off «Box» to find the row: said in the switcher's own word («Local»), with «Show Box again» (${J(sw.toasts)})`, sw);
  Ws.actions[0].run();
  ok(Ws.sb._wbRecentHost === 'h1' && Ws.sb._wbHistoryHost === '', '…and its door puts the RECENT switcher back (the workbench\'s own switch-back, drawn again)', { recent: Ws.sb._wbRecentHost, history: Ws.sb._wbHistoryHost });
  const Wh2 = world({ open: true, tab: 'folders', zone: 'closed', switched: { zone: 'history', host: 'h2', name: 'Lab' } });
  const sw2 = await press(LOCATE, Wh2);
  ok(sw2.flashes === 1 && verdictOf(/^History now shows Local, to find this conversation \(it showed Lab\)$/.test(sw2.toasts[0] || '')), `a History switcher: its own sentence (${J(sw2.toasts)})`, sw2);
  Wh2.actions[0].run();
  ok(Wh2.sb._wbHistoryHost === 'h2' && Wh2.sb._wbRecentHost === '', '…and its door puts the HISTORY switcher back');
  // the row NOT shown (not drawn in time): what Locate switched is PUT BACK, silently — no switch sentence
  const Wn2 = world({ open: true, tab: 'folders', zone: 'closed', never: false, switched: { zone: 'recent', host: 'h1', name: 'Box' } });
  Wn2.sb._openZoneOf = function () { (this._locateSwitched || []).push({ zone: 'recent', host: 'h1', name: 'Box' }); this._wbRecentHost = ''; return 'render'; };   // opens, yet the row never draws
  Wn2.sb.zoneOpen = false;
  const nv2 = await press(LOCATE, Wn2);
  ok(nv2.toasts.length === 1 && gateOf(/did not draw this conversation in time/.test(nv2.toasts[0])) && Wn2.sb._wbRecentHost === 'h1', `the row not drawn in time: only the timeout sentence, and the switcher is put back (${J(nv2.toasts)}, recent=${Wn2.sb._wbRecentHost})`, nv2);
}

console.log('④b THE ZONE THAT HOLDS THE ROW (sidebar-workbench.js _openZoneOf — the sessions tab is zones, not folders)');
{
  const WB = read('src/lib/sidebar-workbench.js');
  const num = (name) => Function('return ' + (WB.match(new RegExp(`const ${name} = ([^;]+);`)) || [])[1])();
  const RMS = num('RECENT_MS'), PAGE = num('HISTORY_PAGE');
  const OPEN = new Function('RECENT_MS', 'HISTORY_PAGE', 'return ' + asFunction(methodText(WB, '    _openZoneOf(sessionId) {')))(RMS, PAGE);
  const SAID = (() => { const a = WB.indexOf('    _locateSaid(zone, host) {'); return a < 0 ? null : new Function('return ({ ' + WB.slice(a, WB.indexOf('\n', a)) + ' })')()._locateSaid; })();
  const now = Date.now(), DAY = 86400e3;
  const fake = (rows, st = {}) => Object.assign({ _allSessions: rows, _columnListWanted: () => false, listEl: null, _locateSaid: SAID, _locateSwitched: [], _hostsData: { hosts: [{ id: 'h1', name: 'Box' }] } }, st);
  const row = (id, ageDays, extra = {}) => ({ sessionId: id, status: 'stopped', cwd: '/p', startedAt: now - ageDays * DAY, ...extra });
  const R = [];
  let f = fake([row('a', 1)]); R.push(['a recent row past its project\'s five', OPEN.call(f, 'a') === 'render' && f._wbProjExpanded.has('/p')]);
  f = fake([row('a', 1)], { _wbProjExpanded: new Set(['/p']) }); R.push(['…already expanded: nothing to open', OPEN.call(f, 'a') === false]);
  f = fake([row('a', 1)], { _wbRecentHost: 'h1', _wbProjExpanded: new Set(['/p']) }); R.push(['Recent showing another machine: this machine\'s, for this page — and the switch KEPT for Locate to say', OPEN.call(f, 'a') === 'render' && f._wbRecentHost === '' && J(f._locateSwitched) === J([{ zone: 'recent', host: 'h1', name: 'Box' }])]);
  f = fake([row('o', 30)]); R.push(['History closed: opened', OPEN.call(f, 'o') === 'render' && f._wbHistoryOpen === true]);
  f = fake([row('o', 30)], { _wbHistoryOpen: true, _wbHistoryHost: 'h1' }); R.push(['History showing another machine: this machine\'s — and the switch kept for Locate to say', OPEN.call(f, 'o') === 'render' && f._wbHistoryHost === '' && J(f._locateSwitched) === J([{ zone: 'history', host: 'h1', name: 'Box' }])]);
  f = fake([row('a', 1)], { _wbRecentHost: 'h1', _wbProjExpanded: new Set(['/p']), _locateSwitched: null }); R.push(['no press recording: a switch writes no record', OPEN.call(f, 'a') === 'render' && f._locateSwitched === null]);
  const many = Array.from({ length: 200 }, (_, i) => row('h' + i, 10 + i));
  f = fake(many, { _wbHistoryOpen: true }); R.push([`a History row at place 130: the page reaches it (cap ${PAGE} → ${Math.ceil(131 / PAGE) * PAGE})`, OPEN.call(f, 'h130') === 'render' && f._wbHistoryCap === Math.ceil(131 / PAGE) * PAGE]);
  f = fake([row('l', 30, { status: 'live' })]); R.push(['a live row: the Live zone draws it, nothing to open', OPEN.call(f, 'l') === false]);
  let scrolled = 0; f = fake([row('a', 1)], { _columnListWanted: () => true, listEl: { querySelector: (q) => (q === '.col-sentinel' ? { scrollIntoView: () => { scrolled++; } } : null) } });
  R.push(['the regular class\'s one column: its next page asked for (the sentinel scrolled)', OPEN.call(f, 'a') === 'scrolled' && scrolled === 1]);
  const bad = R.filter(([, c]) => !c);
  ok(!bad.length, `${R.length} rows: ${R.map(([n]) => n).join(' · ')}`, bad.map(([n]) => n).join(' | '));
  ok(verdictOf(/if \(sb\._openZoneOf\?\.\(backendSessionId\) === 'render'\) sb\._render\?\.\(\);/.test(LIFE)), 'Locate opens the zone each look and draws when it changed');
  ok(verdictOf(/if \(id !== 'tasks'\) this\._mobileDrilldown = null;/.test(RAIL)), 'the show door ends a Task Group\'s drill-down (the phone: it outlived a switch to Sessions)');
}

console.log('⑤ THE TWO SESSION MENUS AGREE — Fork on the window\'s menu, one table for every card command');
{
  const CARD_FILE = 'src/lib/session-card.js', WIN_FILE = 'src/lib/taskbar.js';
  const block = (file, fn) => { const src = read(file); const s = src.indexOf(`export function ${fn}() {`), e = src.indexOf(`// end ${fn}`); if (s < 0 || e < 0) throw new Error(`${file}: no ${fn} block`); return src.slice(s, e).replace('export function', 'function'); };
  const CARD = block(CARD_FILE, 'registerSessionCardMenu'), WIN = block(WIN_FILE, 'registerWindowMenu');
  const cmdsOf = (text) => [...text.matchAll(/registerMenuItem\(\{\s*menu: M,[^\n]*?command: '([\w.]+)'/g)].map((m) => m[1]);
  // + rows by ID with no command of their own (a submenu, an inline run) — in the block, and the card's rows other files register
  const idRowsOf = (text, prefix) => [...text.matchAll(new RegExp(`id: '(${prefix}/[\\w-]+)'`, 'g'))].map((m) => m[1]).filter((id) => !new RegExp(`id: '${id}'[^\\n]*command: '`).test(text));
  const LIB = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => read('src/lib/' + f)).join('\n');
  const CARD_IDS = [...new Set(idRowsOf(LIB, 'session-card'))], WIN_IDS = idRowsOf(WIN, 'window');
  const tableVerdict = (cardText, winText, table) => {
    const card = [...new Set([...cmdsOf(cardText), ...CARD_IDS])], win = new Set([...cmdsOf(winText), ...idRowsOf(winText, 'window')]), problems = [];
    for (const c of card) if (!table[c]) problems.push(`card command ${c} has no row`);
    for (const k of Object.keys(table)) if (!card.includes(k)) problems.push(`row ${k} names no card command`);
    for (const [k, r] of Object.entries(table)) {
      if (r.window && !win.has(r.window)) problems.push(`${k} → ${r.window}: the window's menu does not register it`);
      if (!r.window && !(typeof r.na === 'string' && r.na.trim().split(/\s+/).length >= 4)) problems.push(`${k}: neither a window entry nor a reason in words`);
      if (r.na && win.has(k)) problems.push(`${k}: the window's menu offers it, the table says not applicable`);
    }
    return { card, problems };
  };
  const T = tableVerdict(CARD, WIN, CARD_TO_WINDOW);
  ok(gateOf(CARD_IDS.includes('session-card/outbox')) && gateOf(CARD_IDS.includes('session-card/task-groups')) && verdictOf(WIN_IDS.includes('window/task-groups')), `the card's rows with no command are read too — ${CARD_IDS.join(', ')} (one registered from channel-outbox.js)`);
  ok(T.card.length >= 20 && !T.problems.length, `all ${T.card.length} card commands have a row — ${Object.values(CARD_TO_WINDOW).filter((r) => r.window).length} on the window's menu, the rest not applicable with the reason`, T.problems.join(' | '));
  ok(gateOf(CARD_TO_WINDOW['session.fork']) && CARD_TO_WINDOW['session.fork'].window === 'session.fork' && verdictOf(cmdsOf(WIN).includes('session.fork')), 'Fork is on the window\'s menu — the card\'s own command');
  const noFork = WIN.replace(/\n\s*registerMenuItem\(\{ menu: M, group: '2_session', order: 25, command: 'session\.fork'[^\n]*/, '');
  ok(noFork !== WIN && verdictOf(tableVerdict(CARD, noFork, CARD_TO_WINDOW).problems.some((p) => p.startsWith('session.fork'))), 'RED CONTROL: the window\'s Fork row deleted (the release) is caught');
  const extraCard = CARD.replace("registerMenuItem({ menu: M, group: '3_admin', order: 30, command: 'session.properties' });", "registerMenuItem({ menu: M, group: '3_admin', order: 30, command: 'session.properties' });\n  registerMenuItem({ menu: M, group: '3_admin', order: 35, command: 'session.somethingNew' });");
  ok(extraCard !== CARD && verdictOf(tableVerdict(extraCard, WIN, CARD_TO_WINDOW).problems.some((p) => p.includes('session.somethingNew'))), 'RED CONTROL: a new card command with no row is caught');
  ok(verdictOf(tableVerdict(CARD, WIN, { ...CARD_TO_WINDOW, 'session.fork': { na: 'not on the window menu at all' } }).problems.some((p) => p.startsWith('session.fork'))), 'RED CONTROL: a «not applicable» row for a command the window offers is caught');
  // Fork shows on both menus for the same conversations: both registries, real, run over the same rows
  const backendFeatureCaps = (b) => ({ fork: b !== 'shell', accounts: b === 'claude' || b === 'codex' });   // test-contributions' stand-in
  const fresh = async (tag, winText) => {
    const C = await import(pathToFileURL(path.join(REPO, 'src/lib/contributions.js')).href + '?locate-' + tag);
    new Function('registerCommand', 'registerMenuItem', 'tr', 'backendFeatureCaps', 'copyText', 'showConfirmDialog', CARD)(C.registerCommand, C.registerMenuItem, (s) => s, backendFeatureCaps, () => {}, async () => false);
    new Function('registerCommand', 'registerMenuItem', 't', 'switchWindowItems', winText)(C.registerCommand, C.registerMenuItem, (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s), () => []);
    return C;
  };
  const agree = (C) => {
    const off = [];
    for (const [status, backend, host] of cartesian(['live', 'stopped', 'tmux', 'external'], ['claude', 'codex', 'shell', 'opencode', 'antigravity', undefined], [null, 'h1'])) {
      const s = { status, backend, host, sessionId: 'abc', webuiId: status === 'live' ? 'w1' : null, name: 'N', cwd: '/w' };
      const state = { isStarred: () => false, isArchived: () => false, _tasks: [], getSessionConfig: () => ({}) };
      const cardHas = C.menuItems('session-card', { app: { isMobile: false }, state, s, card: {}, event: { clientX: 1, clientY: 2 }, displayName: 'D', customName: '', originalName: 'N', onRename() {}, agentOpts: {} }).some((i) => i.command === 'session.fork');
      const win = {};
      const winHas = C.menuItems('window', { app: { sidebar: { _tasks: [] }, desktopManager: { getDesktopMenuItems: () => [] }, wm: { windows: new Map([['win-1', win]]) } }, id: 'win-1', win, s, switchSubmenu: false, closeLabel: '✕ Close' }).some((i) => i.command === 'session.fork');
      if (cardHas !== winHas) off.push(J({ status, backend, host, cardHas, winHas }));
    }
    return off;
  };
  const Creal = await fresh('real', WIN);
  const off = agree(Creal);
  const forkRows = ['live', 'stopped'].map((status) => Creal.menuItems('window', { app: { sidebar: { _tasks: [] }, desktopManager: { getDesktopMenuItems: () => [] }, wm: { windows: new Map([['w', {}]]) } }, id: 'w', win: {}, s: { status, sessionId: 'abc' }, switchSubmenu: false, closeLabel: '✕ Close' }).find((i) => i.command === 'session.fork'));
  ok(!off.length && verdictOf(forkRows.every((r) => r && r.label === 'Fork…' && r.kind === 'fork')), `over 48 conversations (4 statuses × 6 agents, every registered harness and none, × 2 locations) the window's menu offers Fork exactly when the card does — «Fork…», under the command's one condition`, off.join(' | '));
  const narrowed = WIN.replace("command: 'session.fork', kind: 'fork', when: hasSess });", "command: 'session.fork', kind: 'fork', when: live });");
  const Cnar = await fresh('narrowed', narrowed);
  ok(narrowed !== WIN && agree(Cnar).length > 0, `RED CONTROL: a window Fork row narrowed to live conversations disagrees with the card (${agree(Cnar).length} conversations)`);
}

console.log('⑥ THE WORDS: three languages, the vague sentence gone, no native dialog');
{
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const timeout = (LIFE.match(/t\('(The session list did not draw[^']+)'\)/) || [])[1];
  const said = [...methodText(LIFE, '  async locateSessionInSidebar(backendSessionId) {').matchAll(/t\('([^']+)'|'((?:Recent|History) now shows [^']+)'/g)].map((m) => m[1] || m[2]);   // every sentence Locate itself says (the switch's two ride a ternary)
  const keys = [...new Set([...Object.values(LOCATE_WORDS).flatMap((w) => [w.words, w.door]).filter(Boolean), timeout, ...said].filter(Boolean))];
  const missing = keys.filter((k) => !ZH.includes(J(k) + ':') || !JA.includes(J(k) + ':'));
  ok(gateOf(timeout) && keys.length >= 19 && !missing.length, `all ${keys.length} sentences and doors (the verdict's and every one Locate says) have a zh and a ja row`, missing.join(' | '));
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(m?js|cjs|html)$/.test(e.name)) files.push(p); } };
  walk('src');
  const vague = files.filter((f) => /['"`]Entry not visible/.test(fs.readFileSync(path.join(REPO, f), 'utf-8')));   // a string the page could say (code or a dictionary row), not a comment telling the story
  const plant = /['"`]Entry not visible/.test(RELEASE_LOCATE);
  ok(!vague.length && verdictOf(plant), `the release's «Entry not visible — it may be archived or filtered out» is said nowhere (${files.length} files; the release's own line is caught)`, vague.join(', '));
  const L = methodText(LIFE, '  async locateSessionInSidebar(backendSessionId) {');
  ok(!/\b(alert|confirm|prompt)\(/.test(L) && verdictOf(/showToast\(words, w\.door \? \{ action: \{ label: t\(w\.door\)/.test(L)), 'Locate says a hidden row in a toast whose action is its door — no native dialog');
  ok(gateOf(/_locateName\?\.\(v\.why, v\.name\)/.test(L)) && gateOf(/if \(why === 'status'\) return \(\{ live: tr\('Live'\)/.test(SIDEBAR)) && verdictOf(/if \(why === 'host'\) return id === 'local' \? tr\('Local'\)/.test(SIDEBAR)),
    'a status, a view, an agent and a location are named in the words the list\'s own controls show, never a raw id');
  const css = read('public/style.css');
  ok(gateOf(/\.session-item-card\.locate-flash \{/.test(css)) && !/\.session-card\.locate-flash/.test(css), 'the flash is drawn on the card\'s real class (`.session-item-card.locate-flash`)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
