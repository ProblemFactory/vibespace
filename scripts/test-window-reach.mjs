#!/usr/bin/env node
// WINDOW REACH + THE SHARE MODE — desktop lane E (docs/design-desktop-apps-seamless §3.6, 2026-09-25; the owner's
// D1–D7). The PURE model src/window-reach.js, table-tested:
//   §1 the closed sets (levels, principal kinds, grant origins, modes, refusals — an unknown refusal THROWS);
//   §2 THE REACH TABLE: every principal × scope combination (a session row by conversation key / by webui key, a
//      group row, none) against every caller shape (its conversation key, its webui key only, in the group, in
//      another group, a stranger) — hidden by default, exposed iff a row names the caller or a group it is in NOW;
//      §2b (lane E verify r2, L4) the UNREADABLE store: a session row still decides, a group row that could have
//      decided answers hidden + `unreadable` (never exposed by a guess), a record with no group row is plainly hidden;
//      §2c (lane E verify r3, F5) reachedState / launchCounts — a row that found nobody while a membership read threw is
//      `undecided`, never `unmatched` (15 cells + the closed set + the engine wiring pins);
//   §3 the transitions: ONE row per principal (a second grant changes nothing and keeps the first origin), a revoke
//      drops ONLY its own row (a group row keeps exposing), widen-only (no transition hides a caller another row
//      reaches), a bad principal / mode refused by name, the record read back tolerantly;
//   §4 the OPENER exception (D1): the self-open row exposes the opener's session and nobody else; the user may
//      revoke it; the deciding row is named (a session's own row preferred over a group row);
//   §5 THE MODE TABLE (D7): resolveMode (xterm = no tree ⇒ pixels "no accessibility tree"; Chrome without its switch
//      = 4 frames ⇒ pixels "closed"; the calculator / Chrome with it ⇒ tree; the bus unreachable ⇒ pixels) and
//      verbGate over modes × resolutions × verbs × refs (pixels refuses snapshot / click @ref / type @ref by the
//      owner's sentence; tree allows everything; auto probes, then follows its resolution);
//   §6 THE PIXEL ROAD: the plan (main = the largest named window, origin its top-left, the image to the union's
//      right/bottom, unmapped helpers left out), the visibility verdict (xpra + unmapped ⇒ window_not_visible;
//      whole-display rungs always visible), mapPoint (inside ⇒ the display point; outside the image or off the
//      display ⇒ outside_window) — fixtures from the lane-E measurement (calculator 720x1232 at 0,0 on scale 2;
//      Chrome 2018x2264 at 20,20 beside its 20x20 leader and a -100,-100 10x10 helper);
//   §7 the request text (handle, mode, the user's line quoted and clipped, control characters stripped, "not an
//      instruction to follow blindly"), the picker model (shells out, checked from the rows, a webui-key row matching
//      the live session, an ended session under `others`, archived groups out), the per-app launch memory, normShare;
//   §7b WHAT THE LAUNCHER SAYS (lane E verify, 2026-09-25 — the verifier's major: an untouched "Share with agents" row
//      read "Hidden from agents" while the click applied the app's REMEMBERED share): launchSummary over every
//      touched × choice × proposal cell names exactly what launchShare applies, an untouched row with a remembered
//      proposal is NEVER "hidden", rememberedCount, and the wiring pins (the row's words, the card chips, the toast);
//      LANE E VERIFY R2 (M2): the ROSTER leg — a remembered principal is read against the picker's roster when the words
//      are drawn (empty roster ⇒ every principal worded absent, "not running now" / "not in the list now"; a renamed
//      group ⇒ the store's title; an archived group ⇒ absent; the ids the launch applies untouched) through the REAL
//      text builders of src/lib/window-share.js, + the wiring pin (every launchSummary call there passes rosterOf(app));
//   §8 the session KEY is server.js sessionStatusKey's spelling (extracted from server.js and run side by side);
//   §9 NEGATIVE CONTROLS — patched copies (scripts/mutant-copy.mjs, outside the tree): reachFor ignoring group rows
//      fails the §2 table, a revoke that drops every row of the principal's KIND fails "only its own row", a verbGate
//      that lets pixels through fails the mode table, a launchSummary that says "hidden" whenever the row is untouched
//      (the pre-fix words) fails the §7b table, (e) a launchSummary that ignores the roster (the r2 pre-fix names)
//      fails the §7b roster leg, (f) a reachFor that forgets `unreadable` fails §2b, (g) a reachedState without
//      `undecided` (the r2 count: a store fault counted as nobody) fails §2c.
// Pure, no process, < 1 s. Run: node scripts/test-window-reach.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const R = require('../src/window-reach.js');
const MUT = mutantCopies('wreach', REPO);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } };

// ─────────────────────────────────────────────────────────────────────────────
console.log('§1 the closed sets');
{
  ok(JSON.stringify(R.LEVELS) === '["hidden","exposed"]' && R.RANK.hidden < R.RANK.exposed, 'two levels, ranked: hidden < exposed');
  ok(JSON.stringify(R.PRINCIPAL_KINDS) === '["session","group"]' && JSON.stringify(R.GRANT_ORIGINS) === '["user","request","self-open"]', 'principals are sessions or Task Groups; a row is written by the user, the user\'s request, or the agent\'s own open');
  ok(JSON.stringify(R.MODES) === '["auto","tree","pixels"]' && JSON.stringify(R.RESOLVED_MODES) === '["tree","pixels"]', 'three share modes, two resolutions');
  let threw = null; try { R.refuse('nope', 'x'); } catch (e) { threw = e; }
  ok(threw && /unknown refusal code/.test(threw.message) && R.refuse('not_exposed', 'x').code === 'not_exposed', 'the refusal set is CLOSED — an unknown code throws');
  ok(['not_exposed', 'mode_pixels', 'window_not_visible', 'outside_window', 'bad_principal', 'bad_mode', 'wake_paced', 'share_local_only', 'reach_unreadable'].every((c) => R.REFUSALS.includes(c)), 'the lane-E codes are all in it (reach_unreadable since verify r2)');
  ok(R.REACH_UNREADABLE_SENTENCE === 'the Task Group store could not be read — try again', 'reach_unreadable has ONE spelling (engine, CLI, manual)');
  ok(Object.isFrozen(R.REFUSALS) && Object.isFrozen(R.MODES) && Object.isFrozen(R.GRANT_ORIGINS), 'every set is frozen');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§2 THE REACH TABLE — every principal × scope × caller');
const S_KEY = 'claude:11111111-aaaa', S_WEBUI = 'webui:w-1', G = 'task-g1', G2 = 'task-g2';
const ROWS = {
  none: [],
  'session(conversation key)': [{ kind: 'session', id: S_KEY }],
  'session(webui key)': [{ kind: 'session', id: S_WEBUI }],
  'group': [{ kind: 'group', id: G }],
  'other session': [{ kind: 'session', id: 'codex:zzzz' }],
  'session + group': [{ kind: 'session', id: S_KEY }, { kind: 'group', id: G }],
};
const CALLERS = {
  'the session (both keys)': { sessionKeys: [S_KEY, S_WEBUI], groupIds: [] },
  'the session before its conversation (webui key only)': { sessionKeys: [S_WEBUI], groupIds: [] },
  'a member of the group': { sessionKeys: ['claude:other'], groupIds: [G] },
  'a member of another group': { sessionKeys: ['claude:other'], groupIds: [G2] },
  'a stranger': { sessionKeys: ['claude:nobody'], groupIds: [] },
};
function expected(rows, caller) { return rows.some((p) => (p.kind === 'session' ? caller.sessionKeys.includes(p.id) : caller.groupIds.includes(p.id))) ? 'exposed' : 'hidden'; }
function build(Rm, rows) { let rec = Rm.emptyRecord('da-1'); for (const p of rows) rec = Rm.grant(rec, p, { by: 'user', at: 1 }).record; return rec; }
function runTable(Rm) {
  const miss = [];
  let cells = 0;
  for (const [rn, rows] of Object.entries(ROWS)) for (const [cn, caller] of Object.entries(CALLERS)) {
    cells++;
    const got = Rm.reachFor(build(Rm, rows), caller).level;
    const want = expected(rows, caller);
    if (got !== want) miss.push(`${rn} × ${cn}: got ${got}, want ${want}`);
  }
  return { cells, miss };
}
{
  const t = runTable(R);
  ok(t.cells === 30 && t.miss.length === 0, `the table (${t.cells} cells): exposed iff a row names the caller's key or a group it is in NOW — ${t.miss.join('; ') || 'every cell as the rule says'}`);
  ok(R.reachFor(R.emptyRecord('x'), { sessionKeys: [S_KEY], groupIds: [G] }).level === 'hidden' && R.reachFor(null, {}).level === 'hidden', 'HIDDEN BY DEFAULT: an empty record (or none) reaches nobody (D1)');
  const joinedLater = build(R, [{ kind: 'group', id: G }]);
  ok(R.reachFor(joinedLater, { sessionKeys: [S_KEY], groupIds: [] }).level === 'hidden' && R.reachFor(joinedLater, { sessionKeys: [S_KEY], groupIds: [G] }).level === 'exposed', 'a Task Group row reaches a session the moment it belongs (membership is the caller\'s NOW — "live now or later")');
  ok(R.reachFor(build(R, [{ kind: 'session', id: S_KEY }]), { sessionId: S_KEY }).level === 'exposed', 'a bare `sessionId` is read as one more key');
}
// §2b lane E verify r2 (L4): the caller's Task Group membership could not be READ (the store threw)
function unreadableMiss(Rm) {
  const miss = [];
  const ctx = { sessionKeys: [S_KEY, S_WEBUI], groupIds: [], unreadable: true };
  const want = { none: ['hidden', false], 'session(conversation key)': ['exposed', false], 'session(webui key)': ['exposed', false], group: ['hidden', true], 'other session': ['hidden', false], 'session + group': ['exposed', false] };
  for (const [rn, rows] of Object.entries(ROWS)) {
    const v = Rm.reachFor(build(Rm, rows), ctx);
    const [lvl, unr] = want[rn];
    if (v.level !== lvl || !!v.unreadable !== unr) miss.push(`${rn}: got ${v.level}${v.unreadable ? ' + unreadable' : ''}, want ${lvl}${unr ? ' + unreadable' : ''}`);
  }
  // a READABLE store never says unreadable
  if (Rm.reachFor(build(Rm, ROWS.group), { sessionKeys: [S_KEY], groupIds: [] }).unreadable) miss.push('a readable store answered unreadable');
  return miss;
}
{
  const m = unreadableMiss(R);
  ok(m.length === 0, `§2b the UNREADABLE store (6 records): a session row still decides; a group row that could have decided ⇒ hidden + unreadable (never exposed by a guess); no group row ⇒ plainly hidden — ${m.join('; ') || 'every cell as the rule says'}`);
}

// §2c lane E verify r3 (F5): does a written row reach anybody NOW — the launch audit's count. A group row that found
// nobody while a live session's membership read THREW is UNDECIDED (the r2 engine folded the fault into "nobody" and
// counted the very group the store could not read as unmatched)
function reachedMiss(Rm) {
  const miss = [];
  const cells = [];
  for (const hits of [0, 1, 3]) for (const unreadable of [0, 1, 2]) cells.push([{ hits, unreadable }, hits > 0 ? 'matched' : unreadable > 0 ? 'undecided' : 'unmatched']);
  cells.push([{}, 'unmatched'], [undefined, 'unmatched'], [{ hits: -1, unreadable: 0 }, 'unmatched'], [{ hits: NaN, unreadable: 'x' }, 'unmatched'], [{ hits: '2', unreadable: 0 }, 'matched'], [{ hits: 0, unreadable: '1' }, 'undecided']);
  for (const [inp, want] of cells) { let got; try { got = Rm.reachedState(inp); } catch (e) { got = 'threw ' + e.message; } if (got !== want) miss.push(`${JSON.stringify(inp)}: got ${got}, want ${want}`); }
  const c = Rm.launchCounts(['matched', 'unmatched', 'undecided', 'undecided', 'matched']);
  if (!c || c.unmatched !== 1 || c.undecided !== 2) miss.push(`launchCounts: got ${JSON.stringify(c)}, want {unmatched:1, undecided:2}`);
  const z = Rm.launchCounts([]);
  if (!z || z.unmatched !== 0 || z.undecided !== 0) miss.push(`launchCounts([]): got ${JSON.stringify(z)}`);
  return { miss, cells: cells.length };
}
{
  const t = reachedMiss(R);
  ok(t.miss.length === 0, `§2c r3 F5: reachedState over ${t.cells} cells — a live session found ⇒ matched; none found while a membership read threw ⇒ UNDECIDED (never unmatched); none found and every read answered ⇒ unmatched; launchCounts counts the two — ${t.miss.join('; ') || 'every cell as the rule says'}`);
  ok(JSON.stringify(R.REACHED_STATES) === '["matched","unmatched","undecided"]', 'the reached states are a closed set of three');
  let threw = null; try { R.launchCounts(['matched', 'nobody']); } catch (e) { threw = e; }
  ok(threw && /unknown reached state/.test(threw.message), 'an unknown reached state THROWS (a closed set, like the refusals)');
  // THE WIRING: the engine's launch audit + share view read these, and liveReached counts the reads that threw
  const eng = fs.readFileSync(path.join(REPO, 'src/server/window-targets-engine.js'), 'utf8');
  const fnBody = (name) => { const i = eng.indexOf(`function ${name}(`); return i < 0 ? '' : eng.slice(i, eng.indexOf('\n  }\n', i)); };
  ok(/R\.launchCounts\(/.test(fnBody('shareAtLaunch')) && /undecided: counts\.undecided/.test(fnBody('shareAtLaunch')) && /unmatched: counts\.unmatched/.test(fnBody('shareAtLaunch')), 'wiring: shareAtLaunch audits R.launchCounts — `unmatched` AND `undecided` (source pin)');
  ok(/if \(c\.unreadable\) \{ unreadable\+\+; continue; \}/.test(fnBody('liveReached')) && /R\.reachedState\(/.test(eng.slice(eng.indexOf('function reachedOf('), eng.indexOf('function reachedOf(') + 400)), 'wiring: liveReached counts a membership read that threw (never "not in the group"), and one helper turns it into the state (source pin; the behaviour is test-window-targets §5\'s F5 leg + its control)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§3 the transitions — one row per principal, own-row revoke, widen-only');
{
  let rec = R.emptyRecord('da-1');
  const g1 = R.grant(rec, { kind: 'session', id: S_KEY, name: 'alpha' }, { by: 'request', at: 5 });
  ok(g1.ok && g1.changed && g1.record.rows.length === 1 && g1.row.by === 'request' && g1.row.grantedAt === 5 && rec.rows.length === 0, 'grant adds ONE row (by, at) and returns a NEW record (the input untouched)');
  const g2 = R.grant(g1.record, { kind: 'session', id: S_KEY, name: 'alpha (renamed)' }, { by: 'user', at: 9 });
  ok(g2.ok && !g2.changed && g2.record.rows.length === 1 && g2.record.rows[0].by === 'request' && g2.record.rows[0].principal.name === 'alpha (renamed)', 'a second grant to the same principal changes nothing (the first origin stays; only a fresher name is kept)');
  rec = R.grant(g2.record, { kind: 'group', id: G, name: 'Ops' }, { at: 10 }).record;
  rec = R.grant(rec, { kind: 'session', id: 'codex:beta', name: 'beta' }, { at: 11 }).record;
  const rv = R.revoke(rec, { kind: 'session', id: S_KEY });
  ok(rv.ok && rv.changed && rv.record.rows.length === 2 && rv.record.rows.every((r) => r.principal.id !== S_KEY) && rv.row.principal.id === S_KEY, 'revoke drops ONLY that principal\'s row (the group row and the other session\'s row stay)');
  ok(R.reachFor(rv.record, { sessionKeys: [S_KEY], groupIds: [G] }).level === 'exposed' && R.reachFor(rv.record, { sessionKeys: [S_KEY], groupIds: [G] }).via === 'group', 'widen-only: a caller whose own row was revoked is still reached by its group\'s row — and `via` names the group so the UI can say so');
  ok(!R.revoke(rv.record, { kind: 'session', id: S_KEY }).changed, 'revoking a principal with no row changes nothing');
  const bad = [R.grant(rec, { kind: 'agent', id: 'x' }), R.grant(rec, { kind: 'session', id: 'no colon' }), R.grant(rec, { kind: 'group', id: 'a b' }), R.grant(rec, null), R.revoke(rec, { kind: 'session' })];
  ok(bad.every((b) => b.ok === false && b.code === 'bad_principal' && !b.changed), 'a bad principal (unknown kind, a session id that is no conversation key, a group id with a space, none) is refused bad_principal');
  let threw = null; try { R.grant(rec, { kind: 'group', id: G2 }, { by: 'agent' }); } catch (e) { threw = e; }
  ok(threw && /unknown grant origin/.test(threw.message), 'an unknown grant origin is a programming error (throws)');
  ok(R.setMode(rec, 'pixels').record.mode === 'pixels' && R.setMode(rec, 'pixels').changed && !R.setMode(R.setMode(rec, 'tree').record, 'tree').changed && R.setMode(rec, 'fast').code === 'bad_mode', 'setMode: the three modes, a no-op reported as such, anything else bad_mode');
  const back = R.normRecord({ windowId: 'da-9', mode: 'weird', rows: [{ principal: { kind: 'session', id: S_KEY }, by: 'hacker', grantedAt: 'x' }, { principal: { kind: 'session', id: S_KEY } }, { principal: { kind: 'nope', id: 'x' } }, null] }, 'da-9');
  ok(back.mode === 'auto' && back.rows.length === 1 && back.rows[0].by === 'user' && back.rows[0].grantedAt === 0 && back.windowId === 'da-9', 'a stored record is read back tolerantly: unknown mode → auto, unknown origin → user, a duplicate / bad principal dropped');
  // widen-only as a property: over every sequence of grants, no caller that was exposed becomes hidden
  const ps = [{ kind: 'session', id: S_KEY }, { kind: 'session', id: S_WEBUI }, { kind: 'group', id: G }, { kind: 'group', id: G2 }];
  let violations = 0;
  for (let mask = 0; mask < 256; mask++) {
    let r = R.emptyRecord('p');
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      r = R.grant(r, ps[(mask >> (i * 2)) & 3], { at: i }).record;
      for (const [cn, c] of Object.entries(CALLERS)) { const lv = R.reachFor(r, c).level; if (seen.has(cn) && lv !== 'exposed') violations++; if (lv === 'exposed') seen.add(cn); }
    }
  }
  ok(violations === 0, 'widen-only over every sequence of four grants (256 sequences × 5 callers): a grant never hides anybody');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§4 the opener exception (D1) + the deciding row');
{
  const o = R.openerGrant(R.emptyRecord('da-2'), { key: S_KEY, name: 'alpha', at: 3 });
  ok(o.ok && o.row.by === 'self-open' && R.reachFor(o.record, { sessionKeys: [S_KEY] }).via === 'self-open', 'the agent that opened a window reaches it through its own self-open row');
  ok(R.reachFor(o.record, { sessionKeys: ['claude:other'], groupIds: [G] }).level === 'hidden', '…and nobody else does');
  ok(R.reachFor(R.revoke(o.record, { kind: 'session', id: S_KEY }).record, { sessionKeys: [S_KEY] }).level === 'hidden', 'the user may revoke it like any row (the user always wins)');
  const both = build(R, [{ kind: 'group', id: G }, { kind: 'session', id: S_KEY }]);
  const v = R.reachFor(both, { sessionKeys: [S_KEY], groupIds: [G] });
  ok(v.level === 'exposed' && v.via === 'session' && v.row.principal.kind === 'session', 'with a group row AND its own row, the deciding row is the session\'s own (the more specific grant)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§5 THE MODE TABLE (D7)');
{
  const calc = [{ role: 'frame', actions: [] }, { role: 'push button', name: '7', actions: ['click'] }, { role: 'text', editable: true }];
  const chromeClosed = [{ role: 'application' }, { role: 'frame' }, { role: 'frame' }, { role: 'frame' }];
  const chromeOpen = [{ role: 'frame' }, { role: 'button', name: 'Press me', actions: ['press', 'showContextMenu'] }, { role: 'entry', name: 'Your name', actions: ['activate', 'showContextMenu'], states: ['editable'] }];
  const ctxOnly = [{ role: 'document web', actions: ['showContextMenu', 'clickAncestor'] }];
  ok(R.usableNodes(calc) === 2 && R.usableNodes(chromeClosed) === 0 && R.usableNodes(chromeOpen) === 2 && R.usableNodes(ctxOnly) === 0 && R.usableNodes(null) === 0, 'usableNodes: a non-container role with an action or editable text counts; frames / Chromium\'s showContextMenu-only nodes do not');
  const x = R.resolveMode({ mode: 'auto', probe: { a11yOk: true, nodes: 0, usable: 0 } });
  const c = R.resolveMode({ mode: 'auto', probe: { a11yOk: true, nodes: 4, usable: 0 } });
  const tr = R.resolveMode({ mode: 'auto', probe: { a11yOk: true, nodes: 107, usable: R.usableNodes(calc) } });
  const bus = R.resolveMode({ mode: 'auto', probe: { a11yOk: false } });
  ok(x.mode === 'pixels' && x.why === 'no accessibility tree — pixel mode', `xterm (no tree) ⇒ pixels, said: "${x.why}"`);
  ok(c.mode === 'pixels' && /closed \(4 nodes/.test(c.why), `Chrome without its switch (4 frames) ⇒ pixels: "${c.why}"`);
  ok(tr.mode === 'tree' && /answers/.test(tr.why) && bus.mode === 'pixels' && /unreachable/.test(bus.why), 'a usable tree ⇒ tree; the bus unreachable ⇒ pixels (said)');
  ok(R.resolveMode({ mode: 'tree' }).mode === 'tree' && R.resolveMode({ mode: 'pixels' }).mode === 'pixels' && R.resolveMode({ mode: 'auto' }).mode === null, 'tree / pixels need no probe; auto without one is unresolved (null)');
  // mirror red on 2.369.181: an unreachable tree is pixels WHATEVER the reason — the reason is named, the mode is one
  {
    const reasons = ['python3_missing: python3 is not on PATH', "a11y_unavailable: python3 gi Atspi not importable: No module named 'gi'", 'helper_error: the helper answered nothing parseable (exit 134): dbind-ERROR **: AT-SPI: Couldn\'t connect to accessibility bus', 'helper_missing: window-targets-helper.py is not on disk'];
    const rs = reasons.map((reason) => R.resolveMode({ mode: 'auto', probe: { a11yOk: false, reason } }));
    ok(rs.every((v, i) => v.mode === 'pixels' && v.why.includes(`unreachable here (${reasons[i]})`) && / — pixel mode$/.test(v.why)), `four reasons, ONE resolution (pixels), each reason named: "${rs[1].why}"`);
    const long = R.resolveMode({ mode: 'auto', probe: { a11yOk: false, reason: `helper_error: ${'x'.repeat(2000)}\nsecond line` } });
    ok(long.mode === 'pixels' && long.why.length < R.REASON_MAX + 80 && !long.why.includes('\n') && long.why.includes('…'), `a long helper reason is clipped to one line (${long.why.length} chars)`);
    ok(R.resolveMode({ mode: 'tree', probe: { a11yOk: false, reason: 'python3_missing: x' } }).mode === 'tree', 'an explicit tree share never reads the probe (the reason changes nothing)');
  }
  // the gate, over every mode × resolution × verb × ref
  const VERBS = [['snapshot', false], ['click', true], ['click', false], ['type', true], ['type', false], ['key', false], ['scroll', false], ['screenshot', false]];
  const want = (mode, resolved, verb, ref) => {
    const tree = verb === 'snapshot' || ((verb === 'click' || verb === 'type') && ref);
    if (!tree) return 'ok';
    if (mode === 'pixels') return 'mode_pixels';
    if (mode === 'tree') return 'ok';
    if (verb === 'snapshot') return resolved === 'tree' ? 'ok' : 'probe';
    if (resolved === 'tree') return 'ok';
    if (resolved === 'pixels') return 'mode_pixels';
    return 'probe';
  };
  const got = (Rm, mode, resolved, verb, ref) => { const g = Rm.verbGate({ mode, resolved, verb, hasRef: ref }); return !g.ok ? g.code : g.probe ? 'probe' : 'ok'; };
  const tableMiss = (Rm) => { const miss = []; for (const mode of R.MODES) for (const resolved of [null, 'tree', 'pixels']) for (const [verb, ref] of VERBS) { const w = want(mode, resolved, verb, ref), g = got(Rm, mode, resolved, verb, ref); if (w !== g) miss.push(`${mode}/${resolved}/${verb}${ref ? '@ref' : ''}: ${g} ≠ ${w}`); } return miss; };
  const miss = tableMiss(R);
  ok(miss.length === 0, `verbGate over 3 modes × 3 resolutions × 8 verb shapes (72 cells) — ${miss.join('; ') || 'every cell as D7 says'}`);
  const pg = R.verbGate({ mode: 'pixels', verb: 'snapshot' });
  ok(pg.why === 'the user shared this window in pixel mode — read it with screenshot, act with click --at x,y / type / key / scroll' && pg.why === R.PIXELS_SENTENCE, 'a pixel share refuses a tree verb with the owner\'s sentence (ONE spelling)');
  const ag = R.verbGate({ mode: 'auto', resolved: 'pixels', resolvedWhy: x.why, verb: 'click', hasRef: true });
  ok(ag.code === 'mode_pixels' && ag.why.startsWith('no accessibility tree — pixel mode') && /screenshot/.test(ag.why), 'an auto share resolved to pixels refuses @refs naming WHY (the resolution) and the road');
  globalThis.__tableMiss = tableMiss;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§6 THE PIXEL ROAD — plan, visibility, points (fixtures from the lane-E measurement)');
{
  const calc = [{ id: 4194309, title: 'Calculator', cls: 'gnome-calculator', instance: 'gnome-calculator', x: 0, y: 0, w: 720, h: 1232, mapped: false, depth: 2 }];
  const p0 = R.pixelPlan(calc);
  ok(p0.ok && p0.main.id === 4194309 && p0.origin.x === 0 && p0.w === 720 && p0.h === 1232 && p0.visible === false, 'the calculator at scale 2 with NO viewer: one window 720x1232 at 0,0, visible=false (xpra unmapped it)');
  const v0 = R.visibilityVerdict({ stream: 'xpra', plan: p0 });
  ok(!v0.ok && v0.code === 'window_not_visible' && /nobody has this window open/.test(v0.why), 'xpra + unmapped ⇒ window_not_visible (a click would be a silent no-op, a grab black)');
  ok(R.visibilityVerdict({ stream: 'rfb', plan: p0 }).ok && R.visibilityVerdict({ stream: 'xpra', plan: null }).ok, 'a whole-display rung always has pixels; no plan (the keeper cannot say) is not a refusal');
  const p1 = R.pixelPlan([{ ...calc[0], mapped: true }]);
  ok(R.visibilityVerdict({ stream: 'xpra', plan: p1 }).ok && p1.visible === true, 'with a viewer attached (mapped) it is visible');
  const m7 = R.mapPoint(p1, { x: 86, y: 876 });
  ok(m7.ok && m7.x === 86 && m7.y === 876, 'the "7" key at image px (86,876) maps to display (86,876) — the origin is 0,0 (measured: pressed "7")');
  const chrome = [{ id: 4194308, title: 't', cls: 'Google-chrome', x: 20, y: 20, w: 2018, h: 2264, mapped: true, depth: 2 }, { id: 6291457, cls: 'Google-chrome', x: 20, y: 20, w: 20, h: 20, mapped: false, depth: 1 }, { id: 4194304, cls: null, instance: null, title: null, x: -100, y: -100, w: 10, h: 10, mapped: false, depth: 1 }];
  const pc = R.pixelPlan(chrome);
  ok(pc.ok && pc.main.id === 4194308 && pc.origin.x === 20 && pc.origin.y === 20 && pc.w === 2018 && pc.h === 2264 && pc.members.length === 1, 'Chrome: the main window is the 2018x2264 one at (20,20) — the unmapped leader and the nameless helper are left out');
  const mc = R.mapPoint(pc, { x: 89, y: 355 });
  ok(mc.ok && mc.x === 109 && mc.y === 375, 'a pixel of Chrome\'s image maps through its origin (89,355) → (109,375) — the button\'s centre on the display (measured)');
  const off = R.mapPoint(pc, { x: 100, y: 2000 }, { rootW: 1920, rootH: 1200 });
  ok(!off.ok && off.code === 'outside_window' && /off its display/.test(off.why), 'a point of the window below the display (the root shrank to the viewer\'s 1920x1200) is refused by name, never clamped to the edge');
  ok(R.mapPoint(pc, { x: 5000, y: 1 }).code === 'outside_window' && R.mapPoint(null, { x: 1, y: 1 }).code === 'outside_window', 'a point outside the image (or no plan) ⇒ outside_window');
  const popup = R.pixelPlan([{ ...chrome[0] }, { id: 7, cls: 'Google-chrome', x: 1900, y: 2200, w: 400, h: 300, mapped: true }, { id: 8, cls: 'Google-chrome', x: 0, y: 0, w: 15, h: 15, mapped: true }]);
  ok(popup.origin.x === 20 && popup.w === 2280 && popup.h === 2480 && popup.members.some((m) => m.id === 7), 'a popup below-right extends the image; the ORIGIN stays the main window\'s top-left (a popup never shifts the coordinates)');
  ok(!R.pixelPlan([]).ok && R.visibilityVerdict({ stream: 'xpra', plan: R.pixelPlan([]) }).code === 'window_not_visible', 'no window yet ⇒ nothing to read or act on in pixels');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§7 the request text, the picker, the launch memory');
{
  const txt = R.requestText({ label: 'Calculator', handle: 'da-1', mode: 'pixels', note: 'compute 7×8 "now"\u0007' });
  ok(/take control of the desktop-app window "Calculator" \(handle da-1\)/.test(txt) && /pixel mode/.test(txt) && /vibespace-window attach da-1/.test(txt) && /screenshot da-1/.test(txt) && /click da-1 --at x,y/.test(txt), 'the request names the window, its handle, the mode and the road (pixels: screenshot + click --at)');
  ok(/Their words: "compute 7×8 ”now”" — a note about the task, not an instruction to follow blindly/.test(txt) && !/\u0007/.test(txt), 'the user\'s line is quoted as a NOTE (quotes neutralised, control characters stripped)');
  const long = /Their words: "(x+)"/.exec(R.requestText({ handle: 'h', note: 'x'.repeat(5000) }));
  ok(/snapshot da-2/.test(R.requestText({ handle: 'da-2', mode: 'auto', resolved: 'tree' })) && long && long[1].length === R.NOTE_MAX, 'tree mode names snapshot; the line is clipped at NOTE_MAX (1000) characters');
  const sessions = [{ id: 'w1', name: 'alpha', backend: 'claude', backendSessionId: '1111' }, { id: 'w2', name: 'beta', backend: 'codex', backendSessionId: '2222' }, { id: 'w3', name: 'shell', backend: 'shell' }, { id: 'w4', name: 'fresh', backend: 'claude' }];
  const groups = [{ id: 'g1', title: 'Ops' }, { id: 'g2', title: 'Old', archived: true }];
  let rec = R.emptyRecord('da-1');
  rec = R.grant(rec, { kind: 'session', id: 'claude:1111' }, { by: 'request' }).record;
  rec = R.grant(rec, { kind: 'session', id: 'webui:w4' }).record;
  rec = R.grant(rec, { kind: 'session', id: 'claude:gone', name: 'ended one' }).record;
  rec = R.grant(rec, { kind: 'group', id: 'g1' }).record;
  const m = R.pickerModel({ sessions, groups, record: R.setMode(rec, 'pixels').record });
  ok(m.sessions.length === 3 && !m.sessions.some((s) => s.name === 'shell') && m.mode === 'pixels', 'the picker lists the agent sessions (a plain shell terminal is no agent) and the mode');
  ok(m.sessions.find((s) => s.id === 'w1').checked && m.sessions.find((s) => s.id === 'w1').by === 'request' && !m.sessions.find((s) => s.id === 'w2').checked && m.sessions.find((s) => s.id === 'w4').checked && m.sessions.find((s) => s.id === 'w4').hasConversation === false, 'checked from the rows (by its conversation key, or its webui key before it has one), the origin carried');
  ok(m.groups.length === 1 && m.groups[0].checked && m.others.length === 1 && m.others[0].principal.name === 'ended one', 'an archived group is out; a row naming a session that ended comes back under `others` (still revocable)');
  const map = R.setProposal({}, 'gnome-calculator', { principals: [{ kind: 'group', id: 'g1', name: 'Ops' }], mode: 'pixels' });
  ok(R.proposalOf(map, 'gnome-calculator').mode === 'pixels' && R.proposalOf(map, 'gnome-calculator').principals[0].id === 'g1' && R.proposalOf(map, 'xterm').principals.length === 0 && R.proposalOf(map, 'xterm').mode === 'auto', 'the per-app launch memory: remembered per app key, nothing remembered = hidden + auto');
  ok(!('gnome-calculator' in R.setProposal(map, 'gnome-calculator', { principals: [], mode: 'auto' })), 'an empty auto share REMOVES the key (the map never grows by choices that change nothing)');
  ok(R.launchShare({ touched: false, map, key: 'gnome-calculator' }).mode === 'pixels' && R.launchShare({ touched: true, choice: { principals: [], mode: 'tree' }, map, key: 'gnome-calculator' }).mode === 'tree', 'a launch uses the dialog\'s choice when the user set it, else what the app remembers');
  ok(R.normShare(null).share === null && R.normShare({ principals: [{ kind: 'x' }] }).code === 'bad_principal' && R.normShare({ principals: [], mode: 'fast' }).code === 'bad_mode' && R.normShare({ principals: [{ kind: 'group', id: 'g1' }] }).share.mode === 'auto', 'normShare validates the launch body\'s share by name');
  ok(R.shareSummary(rec).count === 4 && R.shareSummary(R.setMode(rec, 'auto').record, { mode: 'pixels' }).shown === 'pixels', 'the chip\'s summary: the count, and auto shows what it resolved to');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§7b what the launcher SAYS a launch shares — the words name the act (lane E verify)');
const P_ALPHA = { kind: 'session', id: 'claude:conv-a', name: 'alpha' }, P_OPS = { kind: 'group', id: 'task-ops', name: 'Ops' };
const CHOICES = { none: null, 'empty·auto': { principals: [], mode: 'auto' }, 'empty·pixels': { principals: [], mode: 'pixels' }, 'alpha·auto': { principals: [P_ALPHA], mode: 'auto' }, 'ops·tree': { principals: [P_OPS], mode: 'tree' } };
const PROPOSALS = { none: null, 'empty·auto': { principals: [], mode: 'auto' }, 'mode-only·pixels': { principals: [], mode: 'pixels' }, 'alpha·auto': { principals: [P_ALPHA], mode: 'auto' }, 'ops+alpha·pixels': { principals: [P_OPS, P_ALPHA], mode: 'pixels' } };
function summaryMiss(Rm) {
  const miss = [];
  let cells = 0;
  for (const touched of [false, true]) for (const [cn, choice] of Object.entries(CHOICES)) for (const [pn, proposal] of Object.entries(PROPOSALS)) {
    cells++;
    const tag = `touched=${touched} choice=${cn} proposal=${pn}`;
    const sum = Rm.launchSummary({ touched, choice, proposal });
    const act = Rm.launchShare({ touched, choice, map: proposal ? { app: proposal } : null, key: 'app' });
    // THE INVARIANT: the words name exactly what the click applies
    if (JSON.stringify(sum.principals) !== JSON.stringify(act.principals) || sum.mode !== act.mode) miss.push(`${tag}: says ${JSON.stringify([sum.principals.map((p) => p.id), sum.mode])} but applies ${JSON.stringify([act.principals.map((p) => p.id), act.mode])}`);
    const nonEmpty = act.principals.length > 0 || act.mode !== 'auto';
    if (touched && choice) { if (sum.kind !== 'chosen') miss.push(`${tag}: kind ${sum.kind}, want chosen`); }
    else if (sum.kind !== (nonEmpty ? 'remembered' : 'hidden')) miss.push(`${tag}: kind ${sum.kind}, want ${nonEmpty ? 'remembered' : 'hidden'} (${nonEmpty ? 'the click APPLIES a remembered share — "hidden" would state the opposite' : 'nothing is shared'})`);
    if (sum.hidden !== !act.principals.length) miss.push(`${tag}: hidden=${sum.hidden} with ${act.principals.length} principals`);
  }
  return { miss, cells };
}
{
  const t = summaryMiss(R);
  ok(t.miss.length === 0 && t.cells === 50, `launchSummary over ${t.cells} cells (touched × the row's choice × the app's remembered share): the words name EXACTLY what launchShare applies`, t.miss.slice(0, 6));
  const rem = R.launchSummary({ touched: false, choice: null, proposal: R.proposalOf({ 'google-chrome': { principals: [P_ALPHA], mode: 'auto' } }, 'google-chrome') });
  ok(rem.kind === 'remembered' && rem.principals[0].name === 'alpha' && rem.mode === 'auto' && !rem.hidden, 'THE VERIFIER\'S REPRO: an untouched row + Chrome remembering alpha · Auto ⇒ "remembered, alpha, Auto" — never "hidden"');
  ok(R.launchSummary({ touched: false, proposal: null }).kind === 'hidden' && R.launchSummary({ touched: true, choice: { principals: [], mode: 'auto' }, proposal: { principals: [P_OPS], mode: 'pixels' } }).kind === 'chosen', 'nothing remembered ⇒ hidden; the user\'s own choice in THIS dialog wins over the memory (chosen — even an empty one)');
  ok(R.rememberedCount({ a: { principals: [P_OPS], mode: 'auto' }, b: { principals: [], mode: 'pixels' }, c: { principals: [], mode: 'auto' }, d: { principals: [{ kind: 'robot' }], mode: 'auto' } }) === 2 && R.rememberedCount(null) === 0 && R.rememberedCount({}) === 0, 'rememberedCount counts the apps whose memory changes anything (a legacy empty-auto key and an unreadable principal do not)');
  // THE WIRING (a PURE fix is only a fix where it is called — the 2.355.0 unstaged-wiring lesson)
  const share = fs.readFileSync(path.join(REPO, 'src/lib/window-share.js'), 'utf8');
  const launcher = fs.readFileSync(path.join(REPO, 'src/lib/desktop-app-launcher.js'), 'utf8');
  const rowRender = /const render = \(\) => \{[\s\S]*?\n  \};/.exec(share.slice(share.indexOf('export function mountLaunchShareRow')));
  ok(!!rowRender && /btn\.textContent = launchRowText\(\{ touched, choice, map: REACH_MAP \|\| \{\}, roster: rosterOf\(app\) \}\)/.test(rowRender[0]) && /paintCards\(\)/.test(rowRender[0]) && !/btn\.textContent = t\(/.test(rowRender[0]), 'the row\'s words come from launchRowText over the SAME memory shareFor reads (REACH_MAP) — no literal "hidden" in the row\'s render');
  ok(/rememberedCount\(map\) \? t\('Each app launches as you last shared it'\)/.test(share) && /launchShareText\(launchSummary\(\{ touched: false, proposal: proposalOf\(REACH_MAP \|\| \{\}, launchKeyOf\(\{ appId: card\.dataset\.appId \}\)\), roster: rosterOf\(app\) \}\)\)/.test(share) && /mapListeners\.add\(onMap\)/.test(share) && /notifyMap\(\)/.test(share), 'the untouched row speaks of the memory whenever any app remembers a share; each card names ITS remembered share; both repaint when the memory loads or changes');
  ok(/shareRow\.decorateCards\(\[regEl, browsersEl\]\)/.test(launcher) && /shareRow\.announce\(shareKey, share, r\)/.test(launcher), 'the launcher calls decorateCards on its catalog and announces a launch that applied a remembered share (toast)');
}
// LANE E VERIFY R2 (M2): the chip and the toast named principals straight from the per-app memory — an ended session, a
// deleted Task Group (a re-created one has a new id), an old group name — while the launch wrote rows nobody matches
const REM = { principals: [{ kind: 'session', id: 'claude:conv-a', name: 'alpha' }, { kind: 'group', id: 'task-ops', name: 'Ops' }], mode: 'auto' };
function rosterMiss(Rm) {
  const miss = [];
  const ids = (sum) => JSON.stringify(sum.principals.map((p) => [p.kind, p.id]));
  const want = JSON.stringify(REM.principals.map((p) => [p.kind, p.id]));
  const empty = Rm.launchSummary({ touched: false, proposal: REM, roster: { sessions: [], groups: [] } });
  if (!(empty.principals[0].absent === 'session' && empty.principals[1].absent === 'group')) miss.push(`an empty roster: ${JSON.stringify(empty.principals)} (want both absent)`);
  if (ids(empty) !== want) miss.push('the ids the launch applies changed');
  const live = Rm.launchSummary({ touched: false, proposal: REM, roster: { sessions: [{ id: 'w1', name: 'alpha (renamed)', backend: 'claude', backendSessionId: 'conv-a' }, { id: 'sh', name: 'a shell', backend: 'shell' }], groups: [{ id: 'task-ops', title: 'Ops Team' }] } });
  if (live.principals.some((p) => p.absent) || live.principals[0].name !== 'alpha (renamed)' || live.principals[1].name !== 'Ops Team') miss.push(`a live roster: ${JSON.stringify(live.principals)} (want the session's and the store's CURRENT names, nothing absent)`);
  const arch = Rm.launchSummary({ touched: false, proposal: REM, roster: { sessions: [{ id: 'w1', name: 'x', backend: 'claude' }], groups: [{ id: 'task-ops', title: 'Ops', archived: true }] } });
  if (arch.principals[1].absent !== 'group') miss.push('an ARCHIVED group is not in the picker — the words must say so too');
  if (arch.principals[0].absent !== 'session') miss.push('a live session whose key is not the remembered one (webui:w1 ≠ claude:conv-a) still matched');
  const webui = Rm.launchSummary({ touched: false, proposal: { principals: [{ kind: 'session', id: 'webui:w9', name: 'fresh' }], mode: 'tree' }, roster: { sessions: [{ id: 'w9', name: 'fresh', backend: 'claude' }], groups: [] } });
  if (webui.principals[0].absent) miss.push('a session remembered by its webui key (no conversation yet) is live');
  return miss;
}
{
  const m = rosterMiss(R);
  ok(m.length === 0, 'the ROSTER leg: a remembered principal is read against the picker\'s roster — gone ⇒ absent (ended session, deleted / archived group), present ⇒ its CURRENT name; the ids the launch applies are untouched', m);
  if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) ok(false, 'src/lib/build-version.js missing — run `npm run build` first (the words leg imports src/lib/window-share.js)');
  else {
    const S = await import('../src/lib/window-share.js');
    const gone = R.launchSummary({ touched: false, proposal: REM, roster: { sessions: [], groups: [] } });
    ok(S.launchShareText(gone) === 'Shared with alpha (not running now), Ops (not in the list now) · Auto', `the card chip WORDS an absent principal in the picker's own words: "${S.launchShareText(gone)}"`);
    ok(S.launchedToastText(gone) === 'Started shared with alpha (not running now), Ops (not in the list now) · Auto — change it from the window\'s ⋯', `…and so does the toast: "${S.launchedToastText(gone)}"`);
    const renamed = R.launchSummary({ touched: false, proposal: REM, roster: { sessions: [{ id: 'w1', name: 'alpha', backend: 'claude', backendSessionId: 'conv-a' }], groups: [{ id: 'task-ops', title: 'Ops Team' }] } });
    ok(S.launchShareText(renamed) === 'Shared with alpha, Ops Team · Auto', `a renamed Task Group is named by the store's CURRENT title, never the remembered one ("${S.launchShareText(renamed)}")`);
    ok(S.launchShareText(R.launchSummary({ touched: false, proposal: REM })) === 'Shared with alpha, Ops · Auto', 'no roster handed in ⇒ the memory as written (so the wiring pin below is what keeps the roster in)');
  }
  // THE WIRING: every launchSummary the launcher draws words from reads the roster (rosterOf(app) — the picker's own)
  const share = fs.readFileSync(path.join(REPO, 'src/lib/window-share.js'), 'utf8');
  // each `launchSummary({…})` CALL, its argument read with balanced parentheses (a nested launchKeyOf({…}) inside it)
  const calls = [];
  for (let i = share.indexOf('launchSummary({'); i >= 0; i = share.indexOf('launchSummary({', i + 1)) {
    let depth = 0, j = i + 'launchSummary'.length;
    for (; j < share.length; j++) { if (share[j] === '(') depth++; else if (share[j] === ')' && --depth === 0) break; }
    calls.push(share.slice(i, j + 1));
  }
  ok(calls.length >= 3 && calls.every((c) => /roster(: rosterOf\(app\))?\b/.test(c)), `every launchSummary call in window-share.js passes the roster (${calls.length}: ${calls.map((c) => c.slice(0, 60)).join(' | ')})`);
  ok(/launchShareText\(launchSummary\(\{ touched: false, proposal: proposalOf\(REACH_MAP \|\| \{\}, launchKeyOf\(\{ appId: card\.dataset\.appId \}\)\), roster: rosterOf\(app\) \}\)\)/.test(share) && /launchedToastText\(launchSummary\(\{ touched: false, proposal: share, roster: rosterOf\(app\) \}\)\)/.test(share), 'rosterOf(app) → the card chip\'s and the toast\'s text builders');
  ok(/p\.absent === 'session'\) return t\('\{name\} \(\{state\}\)', \{ name, state: t\('not running now'\) \}\)/.test(share) && /p\.absent === 'group'\) return t\('\{name\} \(\{state\}\)', \{ name, state: t\('not in the list now'\) \}\)/.test(share), 'the absent words are the picker\'s own keys ("not running now" / "not in the list now")');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§8 the session key IS server.js sessionStatusKey\'s spelling');
{
  const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const m = /function sessionStatusKey\(session, id\) \{[\s\S]*?\n\}/.exec(src);
  ok(!!m, 'server.js still defines sessionStatusKey (the Task Group store keys by it)');
  if (m) {
    const serverKey = new Function(`${m[0]}; return sessionStatusKey;`)();
    const shapes = [[{ backendSessionId: 'b1', backend: 'codex' }, 'w1'], [{ claudeSessionId: 'c1' }, 'w2'], [{}, 'w3'], [{ backend: 'claude', backendSessionId: 'x', claudeSessionId: 'y' }, 'w4'], [null, 'w5']];
    const diff = shapes.filter(([s, id]) => serverKey(s || {}, id) !== R.sessionKeyOf(s || {}, id));
    ok(diff.length === 0, `R.sessionKeyOf answers what server.js answers for ${shapes.length} session shapes — a grant and a Task Group membership name a session the same way`);
    ok(JSON.stringify(R.callerKeys({ backendSessionId: 'b1', backend: 'codex' }, 'w1')) === '["codex:b1","webui:w1"]', 'a caller answers to its conversation key AND its webui key');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§9 NEGATIVE CONTROLS — patched copies outside the tree');
{
  const file = path.join(REPO, 'src/window-reach.js');
  const src = fs.readFileSync(file, 'utf8');
  // (a) reachFor ignores group rows
  const a = src.replace("const hit = row.principal.kind === 'session' ? keys.has(row.principal.id) : groups.has(row.principal.id);", "const hit = row.principal.kind === 'session' ? keys.has(row.principal.id) : false;");
  ok(a !== src, 'control (a): the patch applies (reachFor ignoring group rows)');
  const Ra = MUT.load('src/window-reach.js', a, 'nogroups');
  const ta = runTable(Ra);
  ok(ta.miss.length > 0 && ta.miss.some((x) => /group/.test(x)), `control (a) FAILS the §2 table (${ta.miss.length} cells wrong) — the table is what catches it`);
  // (b) revoke drops every row of the principal's kind
  const b = src.replace("const i = rec.rows.findIndex((r) => principalKey(r.principal) === principalKey(p));\n  if (i < 0) return { ok: true, record: rec, changed: false, row: null };\n  const [row] = rec.rows.splice(i, 1);", "const i = rec.rows.findIndex((r) => principalKey(r.principal) === principalKey(p));\n  if (i < 0) return { ok: true, record: rec, changed: false, row: null };\n  const row = rec.rows[i]; rec.rows = rec.rows.filter((r) => r.principal.kind !== p.kind);");
  ok(b !== src, 'control (b): the patch applies (a revoke dropping every row of that kind)');
  const Rb = MUT.load('src/window-reach.js', b, 'kindrevoke');
  let rb = Rb.emptyRecord('x'); rb = Rb.grant(rb, { kind: 'session', id: S_KEY }).record; rb = Rb.grant(rb, { kind: 'session', id: 'codex:beta' }).record;
  const after = Rb.revoke(rb, { kind: 'session', id: S_KEY }).record;
  ok(after.rows.length === 0, 'control (b) FAILS "revoke drops ONLY its own row" (the other session lost its row too) — the §3 leg is what catches it');
  // (c) pixel mode lets the tree through
  const c = src.replace("if (mode === 'pixels') return { ...refuse('mode_pixels', PIXELS_SENTENCE), probe: false };", "if (mode === 'pixels') return { ok: true, code: null, why: null, probe: false };");
  ok(c !== src, 'control (c): the patch applies (pixel mode not refusing the tree)');
  const Rc = MUT.load('src/window-reach.js', c, 'pixelsopen');
  ok(globalThis.__tableMiss(Rc).length > 0, `control (c) FAILS the §5 mode table (${globalThis.__tableMiss(Rc).length} cells wrong)`);
  // (d) the pre-fix words: an untouched row always says "hidden" (lane E verify — the verifier's major)
  const d = src.replace("const kind = touched && choice ? 'chosen' : (s.principals.length || s.mode !== 'auto') ? 'remembered' : 'hidden';", "const kind = touched && choice ? 'chosen' : 'hidden';");
  ok(d !== src, 'control (d): the patch applies (launchSummary saying "hidden" whenever the row is untouched)');
  const Rd = MUT.load('src/window-reach.js', d, 'untouchedhidden');
  const td = summaryMiss(Rd);
  ok(td.miss.length > 0 && td.miss.some((x) => /want remembered/.test(x)), `control (d) FAILS the §7b table (${td.miss.length} cells wrong — the untouched row stating the opposite of the click)`);
  // (e) lane E verify r2 (M2): launchSummary ignoring the roster — the pre-fix names straight from the memory
  const e = src.replace('principals: roster ? principalsNow(s.principals, roster) : s.principals,', 'principals: s.principals,');
  ok(e !== src, 'control (e): the patch applies (launchSummary ignoring the roster)');
  const Re = MUT.load('src/window-reach.js', e, 'noroster');
  const te = rosterMiss(Re);
  ok(te.length > 0, `control (e) FAILS the §7b roster leg (${te.length} checks wrong — the remembered names stated as if present)`);
  // (f) lane E verify r2 (L4): reachFor forgetting `unreadable` (the store fault folded into "no groups")
  const f = src.replace("if (!best) return ctx.unreadable && rec.rows.some((r) => r.principal.kind === 'group') ? { level: 'hidden', via: null, row: null, unreadable: true } : { level: 'hidden', via: null, row: null };", "if (!best) return { level: 'hidden', via: null, row: null };");
  ok(f !== src, 'control (f): the patch applies (reachFor without `unreadable`)');
  const Rf = MUT.load('src/window-reach.js', f, 'nounreadable');
  const tf = unreadableMiss(Rf);
  ok(tf.length > 0 && tf.some((x) => /group: got hidden, want hidden \+ unreadable/.test(x)), `control (f) FAILS §2b (${tf.length} cell(s) wrong — an unreadable store reads as "not a member")`);
  // (g) lane E verify r3 (F5): reachedState folding a fault into "nobody" (the r2 count)
  const g = src.replace("return h > 0 ? 'matched' : u > 0 ? 'undecided' : 'unmatched';", "return h > 0 ? 'matched' : 'unmatched';");
  ok(g !== src, 'control (g): the patch applies (reachedState without `undecided`)');
  const Rg = MUT.load('src/window-reach.js', g, 'noundecided');
  const tg = reachedMiss(Rg);
  ok(tg.miss.length > 0 && tg.miss.some((x) => /want undecided/.test(x)), `control (g) FAILS §2c (${tg.miss.length} cell(s) wrong — a store fault counted as nobody)`);
  for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 7 })) ok(r.pass, '§9 tree: ' + r.name, r.pass ? undefined : r.detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
