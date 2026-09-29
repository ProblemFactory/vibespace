#!/usr/bin/env node
// THE POOL'S PLACEMENT, SEEN (DOM-free, 2026-09-28): the Members… dialog's rows under
// Manual priority (src/lib/pool-priority-model.js) — place numbers, a member's state in
// WORDS (never a greyed row), a ⋯ menu with only what applies, the #1 row's "Move every
// conversation here now" that is there even when #1 already is the default (addendum 4),
// the Placement switch's seed (nothing moves by the switch itself) and clear — and the
// placement note the title chip / Session Properties print. Rendered in en / zh / ja from
// the real dictionaries. In-process, no DOM, no server.
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const M = await import('../src/lib/pool-priority-model.js');
const { decidePoolSwitch } = require(path.resolve('src/account-pool-auto.js'));
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
const mkT = (dict) => (k, p) => { let s = (dict && dict[k]) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
const tEn = mkT(null), tZh = mkT(zh), tJa = mkT(ja);
const NOW = 1800000000;

console.log('§1 a member\'s state, in words');
{
  const st = (o) => M.memberState({ nowSec: NOW, ...o });
  const spent = { fiveHour: { utilization: 0.99, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.3, resetsAt: NOW + 86400 } };
  const fine = { fiveHour: { utilization: 0.1, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.3, resetsAt: NOW + 86400 } };
  ok(st({ loggedIn: false, usage: fine }).code === 'signed-out', 'not signed in beats every reading');
  ok(st({ loginState: { state: 'expired' }, usage: fine }).code === 'login-expired' && st({ loginState: { state: 'logged-out' } }).code === 'login-expired', 'a dead login says "login expired" (its quota reading is beside the point)');
  const out = st({ usage: spent });
  ok(out.code === 'out' && out.key === 'out of quota until {time}' && out.params.atMs === (NOW + 3600) * 1000, 'a spent member says until WHEN (the pool\'s own hard bars decide "spent")', out);
  ok(st({ usage: fine }).code === 'usable' && st({}).code === 'unknown', 'usable / no reading yet');
  ok(tZh(out.key, { time: '周二 14:00' }) === '额度用完，周二 14:00 恢复' && tJa(out.key, { time: 'X' }) === 'X まで上限到達', 'zh / ja words', [tZh(out.key, { time: '周二 14:00' }), tJa(out.key, { time: 'X' })]);
}

console.log('§2 the order: seed, moves, rows');
{
  const members = [{ id: 'm', name: 'Martin Max' }, { id: 'u', name: 'UCI Max' }, { id: 'f', name: 'Fish Max', email: 'f@example.test' }];
  const seed = M.seedPriority({ current: 'u', memberIds: ['m', 'u', 'f'] });
  ok(JSON.stringify(seed) === '["u","m","f"]', 'turning Manual priority ON seeds the member the pool SITS ON at the top, then the list order', seed);
  // "nothing moves by the switch itself": the seeded order with the pool on its #1 is not a return
  const caches = { m: { fiveHour: { utilization: 0.1, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.2, resetsAt: NOW + 2 * 86400 } }, u: { fiveHour: { utilization: 0.1, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.3, resetsAt: NOW + 5 * 86400 } }, f: { fiveHour: { utilization: 0.1, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.4, resetsAt: NOW + 3 * 86400 } } };
  const d = decidePoolSwitch({ currentId: 'u', members, readCache: (id) => caches[id], nowSec: NOW, proactive: true, hot: true, explain: true, priority: seed });
  ok(d.to === null, '…and the pool\'s verdict on the seeded order moves NOTHING (automatic EDF would have left UCI for Martin)', d);
  ok(decidePoolSwitch({ currentId: 'u', members, readCache: (id) => caches[id], nowSec: NOW, proactive: true, hot: true, explain: true }).to === 'm', 'control: automatic on the same caches does move (so the seed is what keeps it put)');
  ok(JSON.stringify(M.movePriority(seed, 'f', 'top')) === '["f","u","m"]' && JSON.stringify(M.movePriority(seed, 'm', 'up')) === '["m","u","f"]' && JSON.stringify(M.movePriority(seed, 'm', 'down')) === '["u","f","m"]', 'Move to top / up / down');
  ok(JSON.stringify(M.movePriority(seed, 'u', 'up')) === JSON.stringify(seed) && JSON.stringify(M.movePriority(seed, 'f', 'down')) === JSON.stringify(seed) && JSON.stringify(M.movePriority(seed, 'x', 'top')) === JSON.stringify(seed), 'a move off the end (or of a stranger) is a no-op');
  const stateOf = (id) => (id === 'm' ? { code: 'out', key: 'out of quota until {time}', params: { atMs: (NOW + 3600) * 1000 } } : { code: 'usable', key: 'usable', params: {} });
  const rows = M.priorityRows({ members, checked: ['m', 'u'], order: ['u', 'm'], mode: 'priority', current: 'u', stateOf });
  ok(rows.map((r) => r.id + ':' + (r.place || '-')).join(',') === 'u:1,m:2,f:-', 'rows: the order first (#1, #2), an unchecked member after without a place', rows.map((r) => r.id + ':' + r.place));
  ok(rows.every((r) => r.actions.every((a) => !('disabled' in a))), 'no action is ever DISABLED (a greyed control is refused by the house rules)');
  ok(JSON.stringify(rows[0].actions.map((a) => a.act)) === '["down","gather"]' && JSON.stringify(rows[1].actions.map((a) => a.act)) === '["top","up"]' && rows[2].actions.length === 0, 'only what applies: #1 has no Move up/top (absent), the last no Move down', rows.map((r) => r.actions.map((a) => a.act)));
  ok(rows[0].isDefault && rows[0].actions.some((a) => a.act === 'gather'), 'addendum 4: "Move every conversation here now" is on #1 EVEN WHEN #1 already is the default — never unreachable');
  ok(rows.find((r) => r.id === 'm').state.code === 'out' && rows.find((r) => r.id === 'm').checked, 'an exhausted member is a normal, checked row that SAYS it is out of quota');
  const w = M.rowWords(rows[0], tEn);
  ok(w.place === '#1' && w.name === 'UCI Max' && w.state === 'usable' && w.note === 'new conversations start here', 'row words (en)', w);
  const wz = M.rowWords(rows[1], tZh, { fmtTime: () => '周二 14:00' });
  ok(wz.place === '#2' && wz.state === '额度用完，周二 14:00 恢复', 'row words (zh)', wz);
  const wj = M.rowWords(rows[0], tJa);
  ok(wj.state === '利用可' && wj.note === '新しい会話はここで始まります', 'row words (ja)', wj);
  const auto = M.priorityRows({ members, checked: null, order: ['u'], mode: 'automatic', current: 'u', stateOf });
  ok(auto.every((r) => r.place === null && r.actions.length === 0) && auto.map((r) => r.id).join() === 'm,u,f', 'Automatic: no places, no order menu — the list order (turning Manual priority OFF clears the list)');
  ok(M.placementWords('priority', tZh) === '分配方式：手动优先级' && M.placementWords('automatic', tEn) === 'Placement: Automatic', 'the placement caption');
}

console.log('§3 the chip / Session Properties note');
{
  ok(M.placementNote({ source: 'pooled', placement: 'priority', priorityRank: 1 }, tEn) === 'priority #1', '"priority #1"');
  ok(M.placementNote({ source: 'pooled', placement: 'priority', priorityRank: null }, tEn) === 'outside the priority order', 'a conversation on a member outside the order says so');
  ok(M.placementNote({ source: 'pooled', placement: 'automatic' }, tZh) === '自动', '"automatic" (zh)');
  ok(M.placementNote({ source: 'pooled', placement: 'priority', priorityRank: 1, pinned: true }, tEn) === 'pinned', 'a pin outranks the order in the words too');
  ok(M.placementNote({ source: 'subscription' }, tEn) === '' && M.placementNote(null, tEn) === '', 'a non-pool chip says nothing');
  // verify r1 (identity, words): the note stands beside the member the conversation RUNS ON — "pinned" alone is true
  // only when that member is the pin (it read "全部 → UCI Max (pinned)" for a conversation pinned to Fish Max)
  const onPin = { source: 'pooled', name: '全部', poolTarget: 'Fish Max', poolTargetId: 'f', placement: 'pinned', pinned: 'Fish Max', pinnedId: 'f' };
  const offPin = { ...onPin, poolTarget: 'UCI Max', poolTargetId: 'u' };
  ok(M.placementNote(onPin, tEn) === 'pinned', 'on its pin: "pinned"');
  ok(M.placementNote(offPin, tEn) === 'pinned to Fish Max, running here for now', 'the pin cannot serve (or applies at the next restart) and it runs elsewhere: the note NAMES the pin — never "pinned" beside another member', M.placementNote(offPin, tEn));
  ok(M.placementNote(offPin, tZh) === '固定到 Fish Max，目前先在这里运行' && M.placementNote(offPin, tJa) === 'Fish Max に固定、今はここで実行中', '…zh / ja', [M.placementNote(offPin, tZh), M.placementNote(offPin, tJa)]);
  ok(M.placementNote({ source: 'pooled', pinned: 'Cx B', pinnedId: 'B', poolTarget: 'Cx A', poolTargetId: 'A', placement: 'pinned' }, tEn) === 'pinned to Cx B, running here for now', 'a process that HOLDS its member (codex: the pin applies at the next restart) says the same');
}

console.log('§4 the billing switcher\'s pool SUBMENU (the pin) — addendum 3: the chip and the menu name ONE member');
{
  const pool = { id: 'p', name: '全部', current: 'u', currentName: 'UCI Max', memberOptions: [{ id: 'm', name: 'Martin Max' }, { id: 'u', name: 'UCI Max' }, { id: 'f', name: 'Fish Max' }] };
  // the owner's screenshot: the chip said "全部 → Martin Max" (the conversation's OWN link), the menu said "→ UCI Max" (the default)
  const auth = { source: 'pooled', name: '全部', poolTarget: 'Martin Max', poolTargetId: 'm', placement: 'automatic', poolDefault: 'UCI Max' };
  const spent = { code: 'out', key: 'out of quota until {time}', params: { atMs: (NOW + 3600) * 1000 } };
  const stateOf = (id) => (id === 'f' ? spent : { code: 'usable', key: 'usable', params: {} });
  const m = M.poolSubmenuModel({ pool, auth, pinId: null, live: true, applies: 'now', stateOf });
  ok(m.parent.member === auth.poolTarget && m.parent.memberId === 'm', 'the pool row names THIS conversation\'s member — the same fact the chip prints (Martin Max), never the default (UCI Max)', m.parent);
  ok(m.parent.title && m.parent.title.params.member === 'Martin Max' && m.parent.title.params.default === 'UCI Max' && tEn(m.parent.title.key, m.parent.title.params) === 'This conversation runs on Martin Max; new conversations start on UCI Max.', 'the default is named SEPARATELY, in words, in one sentence (the tooltip)', tEn(m.parent.title.key, m.parent.title.params));
  ok(tZh(m.parent.title.key, m.parent.title.params) === '这个对话在用 Martin Max；新对话从 UCI Max 开始。', '…in zh too');
  const same = M.poolSubmenuModel({ pool, auth: { ...auth, poolTarget: 'UCI Max', poolTargetId: 'u' }, stateOf });
  ok(tEn(same.parent.title.key, same.parent.title.params) === 'This conversation runs on UCI Max.', 'when the conversation IS on the default, one clause says it');
  ok(m.rows[0].act === 'auto' && m.rows[0].checked === true && M.submenuNoteWords(m.rows[0], tZh) === '新对话默认: UCI Max', 'first row: Automatic, ✓ when nothing is pinned, its hint names the default ("新对话默认: UCI Max")', M.submenuNoteWords(m.rows[0], tZh));
  const rowOf = (mm, id) => mm.rows.find((r) => r.id === id);
  ok(rowOf(m, 'm').checked && !rowOf(m, 'u').checked && !rowOf(m, 'f').checked, 'the ✓ inside the submenu sits on the conversation\'s member (Martin), not the default');
  ok(m.rows.every((r) => !('disabled' in r)), 'no row is disabled');
  ok(M.submenuNoteWords(rowOf(m, 'f'), tEn, { fmtTime: () => 'Tue 14:00' }) === 'out of quota until Tue 14:00 · pins now, switches when it can', 'an exhausted member is offered, in words: "out of quota … · pins now, switches when it can"', M.submenuNoteWords(rowOf(m, 'f'), tEn, { fmtTime: () => 'Tue 14:00' }));
  const p = M.poolSubmenuModel({ pool, auth: { ...auth, pinned: 'Fish Max', pinnedId: 'f' }, pinId: 'f', live: true, applies: 'now', stateOf });
  ok(!p.rows[0].checked && rowOf(p, 'f').pinned && /^pinned · out of quota until/.test(M.submenuNoteWords(rowOf(p, 'f'), tEn)), 'pinned: Automatic loses its ✓, the pinned member says "pinned" in words (and still its state)', M.submenuNoteWords(rowOf(p, 'f'), tEn));
  ok(rowOf(p, 'm').checked, '…while the ✓ stays on where it RUNS (the pin waits for Fish)');
  const cold = M.poolSubmenuModel({ pool, auth, pinId: null, live: true, applies: 'restart', stateOf });
  ok(M.submenuNoteWords(rowOf(cold, 'u'), tEn) === 'applies at the next restart' && M.submenuNoteWords(rowOf(cold, 'm'), tEn) === '', 'a pool that cannot re-point a running conversation says "applies at the next restart" on the rows that would move it', M.submenuNoteWords(rowOf(cold, 'u'), tEn));
  const stopped = M.poolSubmenuModel({ pool, auth: null, pinId: null, live: false, stateOf });
  ok(M.submenuNoteWords(rowOf(stopped, 'u'), tJa) === '会話を再開したときに適用' && stopped.parent.member === null, 'a stopped conversation: "applies when it resumes" (ja), no member claimed');
  const gone = M.poolSubmenuModel({ pool, auth, pinId: 'x-removed', live: true, stateOf: () => null });
  ok(rowOf(gone, 'x-removed') && rowOf(gone, 'x-removed').pinned, 'a pinned member the pool no longer offers still shows (so it can be un-pinned)');
}

// §r1g (verify r1, authority — words): "MOVE EVERY CONVERSATION HERE NOW" SAYS WHAT IT DID. The toast read
// "Every conversation of 全部 now uses Fish Max" while a pinned conversation stayed on its pin, and the
// confirm a pool that restarts to move shows named no count.
console.log('§r1g the gather act, in words');
{
  const live = [
    { id: 's-1', accountId: 'p', host: null, poolPin: null }, { id: 's-2', accountId: 'p', host: null },
    { id: 's-3', accountId: 'p', host: null, poolPin: { memberId: 'u', name: 'UCI Max' } },
    { id: 's-r', accountId: 'p', host: 'h1' }, { id: 's-o', accountId: 'other', host: null },
  ];
  const n = M.gatherCount(live, 'p');
  ok(n.move === 2 && n.pinned === 1, 'the count: this pool\'s LOCAL conversations, a pinned one apart (a remote one and another account\'s never)', n);
  const c = M.gatherConfirmWords(n, tEn, { memberName: 'Fish Max' });
  ok(c.title === 'Move 2 conversation(s) to “Fish Max”?' && c.message === 'This pool cannot switch a running conversation in place, so each one restarts and continues via resume. 1 pinned conversation(s) stay on their pin.' && c.confirmText === 'Move & restart', 'ONE confirm that names the count (and the pinned ones it leaves)', c);
  ok(M.gatherConfirmWords(n, tZh, { memberName: 'Fish Max' }).title === '把 2 个对话切到“Fish Max”？' && /^2 件の会話を/.test(M.gatherConfirmWords(n, tJa, { memberName: 'Fish Max' }).title), '…zh / ja');
  ok(M.gatherConfirmWords({ move: 0, pinned: 3 }, tEn, { memberName: 'X' }) === null, 'nothing would restart ⇒ no confirm');
  const said = (r, t = tEn) => M.gatherWords(r, t, { poolName: '全部', memberName: 'Fish Max', fmtTime: () => 'Tue 14:00' });
  ok(said({ success: true, moved: 3, skipped: { pinned: 0, cannotServe: [] }, affected: [] }).text === 'Every conversation of “全部” now uses Fish Max', 'all of them moved ⇒ "Every conversation…"');
  const part = said({ success: true, moved: 2, skipped: { pinned: 1, cannotServe: [{ sid: 's-9', name: 'conv 9', why: 'pin-exhausted' }] }, affected: [{}, {}] });
  ok(part.type === undefined && part.text === '2 conversation(s) of “全部” now use Fish Max — 1 pinned conversation(s) stay on their pin — 1 stay where they are (Fish Max cannot serve them) — restarting 2 conversation(s)…', 'some stayed ⇒ the count that moved, the pinned ones, the ones it cannot serve, the restarts — never "every"', part.text);
  ok(!/Every|所有对话/.test(said({ success: true, moved: 2, skipped: { pinned: 1, cannotServe: [] }, affected: [] }, tZh).text) && /1 个已固定的对话留在各自固定的账号上/.test(said({ success: true, moved: 2, skipped: { pinned: 1, cannotServe: [] }, affected: [] }, tZh).text), '…zh', said({ success: true, moved: 2, skipped: { pinned: 1, cannotServe: [] }, affected: [] }, tZh).text);
  const no = said({ code: 'target_cannot_serve', why: 'pin-exhausted', until: 1800000000000, member: 'Fish Max', error: 'Fish Max is out of quota — nothing was moved.' });
  ok(no.type === 'error' && no.text === 'Fish Max: out of quota until Tue 14:00 — nothing was moved. The pool brings its conversations back to it when it can serve again.', 'a refusal by its CODE, in the device\'s words, with the time', no.text);
  ok(said({ code: 'target_cannot_serve', why: 'pin-login-dead', member: 'Fish Max' }, tZh).text === 'Fish Max：无法登录 — 没有移动任何对话。等它能用时，池会把对话带回来。', '…a login that cannot serve (zh)', said({ code: 'target_cannot_serve', why: 'pin-login-dead', member: 'Fish Max' }, tZh).text);
  ok(said({ error: 'not a signed-in member of this pool', code: 'not_member' }).text === 'not a signed-in member of this pool' && said(null).type === 'error', 'any other refusal: the server\'s sentence; no answer at all: an error');
  const fs2 = require('node:fs');
  const ma = fs2.readFileSync(path.resolve('src/lib/manage-agents.js'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  ok(/const words = gatherConfirmWords\(gatherCount\(this\.sidebar\?\._webuiSessions \|\| \[\], poolId\), t, \{ memberName \}\);/.test(ma) && /const said = gatherWords\(r, t, \{ poolName, memberName, fmtTime \}\);/.test(ma) && !/Every conversation of/.test(ma), 'WIRING PIN: the dialog asks the model for the confirm and for the answer\'s words (no sentence of its own)');
}

// §r1e (verify r1, authority — words): A MEMBER LEFT THE POOL. The act said "Excluded X from pool" and nothing
// else while X kept serving (no other member could take its conversations); the Exclude row's tooltip still
// described the behaviour from before the removed-member wall.
console.log('§r1e a removed member, in the act\'s own words');
{
  // the owner's 全B (2026-09-28): nothing keeps running on the member you removed — a conversation nobody can take stops
  // after its current turn and waits (`held`); `stayed` is only one that could not be parked (nobody signed in)
  ok(M.evictedWords({ removed: ['m'], moved: 0, restarted: 0, stayed: 0, held: 2 }, tEn) === '2 conversation(s) stop after their current turn and wait — no other member can take them right now. They continue when one can.', 'conversations nobody can take: the act says they STOP AND WAIT (全B) — never "keep running"', M.evictedWords({ held: 2 }, tEn));
  ok(M.evictedWords({ removed: ['m'], stayed: 1, held: 0 }, tEn) === '1 conversation(s) could not be parked — no member of the pool is signed in.', '…and one that could not be parked at all says why', M.evictedWords({ stayed: 1 }, tEn));
  ok(M.evictedWords({ removed: ['m'], moved: 3, restarted: 0, stayed: 0 }, tEn) === '' && M.evictedWords(null, tEn) === '', 'everything moved (each conversation is told by the pool) / nothing removed ⇒ nothing to add');
  ok(/^2 个对话会在当前回合结束后停下等待/.test(M.evictedWords({ held: 2 }, tZh)) && /^2 件の会話は現在のターンの後に停止して待機します/.test(M.evictedWords({ held: 2 }, tJa)), '…zh / ja');
  const fs3 = require('node:fs');
  const ma = fs3.readFileSync(path.resolve('src/lib/manage-agents.js'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  ok((ma.match(/const kept = evictedWords\(r\?\.evicted, t\); if \(kept\) showToast\(kept, \{ type: 'error', duration: 10000 \}\);/g) || []).length === 2, 'WIRING PIN: BOTH ways a member leaves a pool (Members… Save, the member\'s own Exclude) say it');
  const tip = 'Removes “{name}” from the pool’s member list. The pool’s conversations running on it move to another member at once — or, when no other member can take them, stop after their current turn and wait; conversations that picked it directly keep running on it.';
  ok(ma.includes(`title: t('${tip}', { name: a.name }),`) && !/member list; conversations that picked it directly keep running on it\./.test(ma) && zh[tip] && ja[tip], 'the Exclude row says BEFORE the click that the pool\'s conversations on it move at once (en / zh / ja)');
}

// §r1 (verify r1, authority): THE PIN'S RESUME CARRIER. The billing submenu saves the pin into the
// conversation's config (sidebar.setSessionConfig) and resumeSession carries `savedCfg.poolPin` — but
// setSessionConfig keeps only the keys it lists, and the pin was not one of them: a stopped
// conversation's pin was never saved (the toast said it was) and a live one lost its pin at its next
// resume. The REAL setSessionConfig, DOM-free (its three imports stubbed in a scratch copy).
console.log('§r1 the pin\'s resume carrier (the real setSessionConfig)');
{
  const fs = require('node:fs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const REPO = path.resolve('.');
  const MC = mutantCopies('poolpin-cfg', REPO);
  const domFree = (s) => s
    .replace("import { getSessionKey, backendFeatureCaps } from './agent-meta.js';", 'const getSessionKey = (s) => (s && s.sessionKey) || null, backendFeatureCaps = () => ({});')
    .replace("import { showToast, showInputDialog } from './utils.js';", 'const showToast = () => {}, showInputDialog = async () => null;')
    .replace("import { t as tr } from './i18n.js';", 'const tr = (s) => s;');
  const src = fs.readFileSync(path.resolve('src/lib/sidebar-state.js'), 'utf8');
  ok(!/^import /m.test(domFree(src)), 'the scratch copy is DOM-free (every import of sidebar-state.js is stubbed)');
  const load = async (text, tag) => {
    const { installSidebarState } = await import(MC.write('src/lib/sidebar-state.js', domFree(text), tag, { esm: true }));
    class Sb { constructor() { this._sessionConfigs = {}; this._sessionModes = {}; this.pushed = 0; } }
    installSidebarState(Sb);
    Sb.prototype._pushUserState = async function () { this.pushed++; };
    return new Sb();
  };
  const key = 'claude:11111111-2222-4333-8444-555555555555';
  const pin = { memberId: 'sub-abc123', at: 1790000000000 };
  const sb = await load(src, 'real');
  sb.setSessionConfig(key, { model: 'fable', poolPin: pin }); // exactly what session-lifecycle's saveCfg writes
  ok(JSON.stringify(sb.getSessionConfig(key)) === JSON.stringify({ model: 'fable', poolPin: pin }), 'a pin saved beside another pick is KEPT (the resume then carries savedCfg.poolPin)', sb.getSessionConfig(key));
  sb.setSessionConfig(key, { poolPin: { ...pin, poolId: 'pool-1', junk: 1 } });
  ok(JSON.stringify(sb.getSessionConfig(key)) === JSON.stringify({ poolPin: { ...pin, poolId: 'pool-1' } }), '…with the pool it was made on (and nothing else a caller hands in)', sb.getSessionConfig(key));
  sb.setSessionConfig(key, { poolPin: pin });
  ok(JSON.stringify(sb.getSessionConfig(key)) === JSON.stringify({ poolPin: pin }), 'a pin is a config of its own (a conversation with no other pick keeps it)', sb.getSessionConfig(key));
  sb.setSessionConfig(key, { ...sb.getSessionConfig(key), worktree: true });
  ok(sb.getSessionConfig(key)?.poolPin?.memberId === pin.memberId, 'another writer\'s spread keeps it (Session Properties, the status bar)');
  { const next = { ...sb.getSessionConfig(key) }; delete next.poolPin; sb.setSessionConfig(key, next); }
  ok(!sb.getSessionConfig(key)?.poolPin && sb.getSessionConfig(key)?.worktree === true, '"Automatic" removes it and nothing else');
  for (const bad of [{}, { memberId: '' }, { memberId: 7 }, 'sub-abc123', true, []]) sb.setSessionConfig(key + ':bad', { poolPin: bad });
  ok(sb.getSessionConfig(key + ':bad') == null, 'a pin without a member id is no pin (kept by shape, never by truthiness)', sb.getSessionConfig(key + ':bad'));
  ok(sb.pushed >= 4, 'every write is pushed to the synced user state (another device\'s resume carries it too)');
  // control: the list as it was (the pin's clause removed) drops the pin — the two assertions above fail on it
  const pre = src.replace(/    if \(config\?\.poolPin && typeof config\.poolPin === 'object'[\s\S]*?\n    \}\n/, '');
  ok(pre !== src, 'control: the patch (the pin\'s clause removed) hits');
  const old = await load(pre, 'prefix');
  old.setSessionConfig(key, { model: 'fable', poolPin: pin });
  ok(JSON.stringify(old.getSessionConfig(key)) === JSON.stringify({ model: 'fable' }), 'control: the pre-fix list DROPS the pin silently (what verify r1 reproduced)', old.getSessionConfig(key));
  old.setSessionConfig(key, { poolPin: pin });
  ok(old.getSessionConfig(key) == null, 'control: …and a pin-only config vanishes whole');
  // the stopped card's popover edits four keys — it must carry the rest along
  const card = fs.readFileSync(path.resolve('src/lib/session-card.js'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  ok(/state\.setSessionConfig\?\.\(s, \{ \.\.\.\(state\.getSessionConfig\?\.\(s\) \|\| \{\}\), \.\.\.overrides \}\);/.test(card) && !/state\.setSessionConfig\?\.\(s, overrides\);/.test(card), 'WIRING PIN: the session card\'s popover writes its four keys OVER the saved config (a model pick on a stopped conversation keeps its pin)');
  // …and every other writer spreads what is saved (census: a fresh object anywhere drops the pin)
  const writers = [];
  for (const f of fs.readdirSync(path.resolve('src/lib')).filter((x) => x.endsWith('.js'))) {
    const text = fs.readFileSync(path.resolve('src/lib', f), 'utf8').split('\n');
    text.forEach((l, i) => { const c = l.replace(/(^|\s)\/\/.*$/, ''); if (/setSessionConfig\??\.?\(/.test(c) && !/proto\.setSessionConfig/.test(c)) writers.push({ f, n: i + 1, l: c.trim(), prev: (text[i - 1] || '') + (text[i - 2] || '') + (text[i - 3] || '') }); });
  }
  const carries = (w) => /\{ \.\.\.\(?[\w.?]*(getSessionConfig|cfg|cur)\b/.test(w.l) || /const next = \{ \.\.\.cfg \}/.test(w.l);
  ok(writers.length >= 8 && writers.every(carries), `CENSUS: every setSessionConfig writer in src/lib (${writers.length}) writes OVER the saved config`, writers.filter((w) => !carries(w)).map((w) => `${w.f}:${w.n} ${w.l}`));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
