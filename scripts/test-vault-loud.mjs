#!/usr/bin/env node
// THE LOCKED VAULT, SAID AT ONCE (lane vault-locked-loud — the owner 2026-10-20: "如果 vault 没解锁应该直接在界面上有个显著提醒，不需要等到
// agent 被 block 了"). Fast, in-process:
//   ① THE TABLE (PURE src/vault-loud.js `vaultLoudState`): every LOUD_TABLE row driven by real-shaped facts — not set up /
//      unlocked say nothing; locked ⇒ the ⚙ mark + the item always, the dialog at a load / reconnect unless this tab set THIS
//      lock aside, at a broadcast only for a new boot; the lock key moves with a restart and with a lock act
//   ② THE ONE READER: src/lib/vault-unlock.js is the only client file that asks it (the dialog, the ⚙ mark, the press), both
//      ⚙ buttons press through `unlockFirst`, the hub's item asks the same table (src/server/vault-hooks.js)
//   ③ THE ITEM over the REAL engine + the REAL For-you store: a locked boot files ONE URGENT action row (band 1 — the badge
//      counts it), the unlock resolves it, a lock act and the idle lock file it again AT ONCE, a refusal names who on the
//      same row; not set up / unlocked file nothing
//   ④ RED CONTROLS = the base: a table that ignores the set-aside lock (every load asks), one that asks at every broadcast, a
//      hooks copy without the lock-act filing, the base's notice row (band 0 — never in the badge)
// Run: node scripts/test-vault-loud.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (rel) => require(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const L = R('src/vault-loud.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };

// the facts a page holds (src/server/vault-engine.js facts(): state, startedAt = the boot, lockedSince = the lock's moment)
const BOOT = 1800000000000;
const F = {
  none: null,
  unset: { state: 'not_set_up', startedAt: BOOT, lockedSince: null },
  open: { state: 'unlocked', startedAt: BOOT, lockedSince: null, unlockedSince: BOOT + 5 },
  locked: { state: 'locked', startedAt: BOOT, lockedSince: BOOT },
};
const KEY = L.lockKey(F.locked);
/** every case a row stands for → [{ input, row index }] */
const CASES = [];
for (const f of [F.none, F.unset]) for (const dismissed of [null, KEY]) for (const on of L.EVENTS) CASES.push({ row: 0, input: { facts: f, dismissed, on, seen: BOOT } });
for (const dismissed of [null, KEY]) for (const on of L.EVENTS) CASES.push({ row: 1, input: { facts: F.open, dismissed, on, seen: BOOT } });
for (const on of ['load', 'reconnect']) for (const dismissed of [null, 'some:other-lock']) CASES.push({ row: 2, input: { facts: F.locked, dismissed, on, seen: BOOT } });
for (const on of ['load', 'reconnect']) CASES.push({ row: 3, input: { facts: F.locked, dismissed: KEY, on, seen: BOOT } });
for (const seen of [undefined, BOOT - 60e3]) for (const dismissed of [null, 'some:other-lock']) CASES.push({ row: 4, input: { facts: F.locked, dismissed, on: 'broadcast', seen } });
for (const dismissed of [null, KEY]) CASES.push({ row: 5, input: { facts: F.locked, dismissed, on: 'broadcast', seen: BOOT } });
const runTable = (fn) => CASES.map((c) => { const want = L.LOUD_TABLE[c.row]; const got = fn(c.input); return { ...c, want, got, ok: got.dialog === want.dialog && got.mark === want.mark && got.item === want.item }; });

console.log('① THE TABLE — every row of LOUD_TABLE, driven by real-shaped facts');
{
  ok(L.LOUD_TABLE.length === 6 && Object.isFrozen(L.LOUD_TABLE) && L.LOUD_TABLE.every((r) => Object.isFrozen(r)), 'six frozen rows');
  const res = runTable(L.vaultLoudState);
  for (let i = 0; i < L.LOUD_TABLE.length; i++) {
    const r = L.LOUD_TABLE[i]; const mine = res.filter((x) => x.row === i);
    ok(mine.length >= 2 && mine.every((x) => x.ok), `row ${i + 1}: ${r.facts} · dismissed ${r.dismissed} · on ${r.on} ⇒ dialog ${r.dialog ? 'OPENS' : 'no'} · ⚙ mark ${r.mark ? 'RED' : 'no'} · item ${r.item ? 'FILED' : 'none'} (${mine.length} cases)`, mine.filter((x) => !x.ok));
  }
  console.log('   the table:');
  for (const r of L.LOUD_TABLE) console.log(`     | ${r.facts.padEnd(22)} | ${r.dismissed.padEnd(13)} | ${r.on.padEnd(26)} | ${(r.dialog ? 'opens' : '—').padEnd(5)} | ${(r.mark ? 'red' : '—').padEnd(3)} | ${r.item ? 'filed' : '—'} |`);
  const restart = { ...F.locked, startedAt: BOOT + 3600e3, lockedSince: BOOT + 3600e3 };
  const lockAct = { ...F.locked, lockedSince: BOOT + 600e3 };
  ok(L.lockKey(restart) !== KEY && L.lockKey(lockAct) !== KEY && L.lockKey({ ...F.locked }) === KEY, 'the lock key moves with a RESTART (a new startedAt) and with a LOCK ACT (a new lockedSince); the same lock keeps it');
  ok(L.vaultLoudState({ facts: restart, dismissed: KEY, on: 'load' }).dialog && L.vaultLoudState({ facts: lockAct, dismissed: KEY, on: 'reconnect' }).dialog, 'a lock set aside asks again once it is a NEW lock (a restart, a lock act) — at the next load / reconnect');
  ok(L.lockKey(F.open) === null && L.lockKey(F.unset) === null && L.lockKey(null) === null, 'no lock key unless locked');
  const old = { state: 'locked' };   // a hub before startedAt / lockedSince
  ok(L.vaultLoudState({ facts: old, on: 'load' }).dialog && L.vaultLoudState({ facts: old, on: 'load' }).lock === ':', 'facts without the boot or the lock moment still ask at a load (the key is never null while locked)');
  ok(L.vaultLoudState({ facts: F.locked, on: 'nonsense' }).dialog === true && !L.vaultLoudState({ facts: null, on: 'broadcast' }).dialog && !L.vaultLoudState().mark, 'an unknown event reads as a load; null facts at a broadcast throw nothing and say nothing');
  ok(L.LATER_KEY === 'vs-vault-unlock-later', 'the set-aside lock lives under one sessionStorage key (vs-vault-unlock-later)');
}

console.log('② THE ONE READER — the page asks the table in one file; the ⚙ presses and the hub\'s item ask the same table');
{
  const VU = read('src/lib/vault-unlock.js');
  const libs = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js'));
  const readers = libs.filter((f) => /from '\.\.\/vault-loud\.js'/.test(read('src/lib/' + f)));
  ok(readers.length === 1 && readers[0] === 'vault-unlock.js', 'ONE client reader: only src/lib/vault-unlock.js imports src/vault-loud.js', readers);
  ok(/^import \{ vaultLoudState, LATER_KEY \} from '\.\.\/vault-loud\.js';/m.test(VU), 'vault-unlock.js imports vaultLoudState + LATER_KEY');
  ok(/if \(vaultLoudState\(\{ facts: f, dismissed: dismissedLock\(\), on, seen \}\)\.dialog\) showUnlock\(\{ opener: 'system' \}\);/.test(VU), 'the DIALOG: onVaultState opens it iff the table says so (the set-aside lock, the event, the boot it saw) — the system\'s open (lane dialog-yield r3: a form that waits behind, the strip and the chip say it)');
  ok(/onVaultState\(msg, 'broadcast'\)/.test(VU) && /onVaultState\(f, 'reconnect'\)/.test(VU) && /onVaultState\(f, 'load'\);\n\}/.test(VU), 'the three doors name their event: the broadcast, the reconnect re-read, the boot read (load)');
  ok(/drawGearMark\(vaultLoudState\(\{ facts: f \}\)\.mark\);/.test(VU) && /const GEAR_IDS = \['btn-global-settings', 'mobile-nav-gear'\];/.test(VU), 'the ⚙ MARK: applyVaultFacts draws it from the table on both buttons (the toolbar\'s, the phone nav\'s)');
  ok(/escapeToClose: true, onClose, kind: 'form' \}\);/.test(VU) && /if \(facts && facts\.state === 'locked'\) dismissLock\(facts\);/.test(VU), 'the dialog: Esc closes it, and a close while still locked sets THIS lock aside (「稍后」 / Esc / ✕ — an unlock does not)');
  ok(/export function unlockFirst\(open\) \{\n  if \(vaultLoudState\(\{ facts \}\)\.mark\) \{ showUnlock\(\{ then: open \}\); return; \}\n  open\(\);\n\}/.test(VU), 'the ⚙ PRESS: unlockFirst — locked ⇒ the dialog first, then the menu; otherwise the menu at once');
  ok(/btn\.onclick = \(e\) => \{ e\.stopPropagation\(\); this\._pressGlobalSettings\(btn\); \};/.test(read('src/lib/app.js')) && /gear\.onclick = \(e\) => \{ e\.stopPropagation\(\); app\._pressGlobalSettings\(gear\); \};/.test(read('src/lib/mobile-nav.js')), 'both ⚙ buttons press through App._pressGlobalSettings (app.js, mobile-nav.js)');
  const H = read('src/server/vault-hooks.js');
  ok(/const loud = \(\) => VL\.vaultLoudState\(\{ facts: vault\.facts\(\) \}\)\.item;/.test(H) && /if \(loud\(\)\) fileItem\(/.test(H) && /vault\.onLock\(\(\) => \{ if \(loud\(\)\) fileItem\(null\); \}\);/.test(H), 'the hub\'s ITEM asks the same table — at boot and at every lock act');
  ok(/kind: 'action', urgency: 'urgent', by: 'agent', sessionName: 'Vault', text: VAULT_ITEM_TEXT/.test(H), 'the item is an URGENT action row (one add() site, its dedupe text unchanged)');
}

console.log('③ THE ITEM over the real engine + the real For-you store');
const ROOT = scratch('vault-loud');
fs.mkdirSync(ROOT, { recursive: true });
const VE = R('src/server/vault-engine.js');
const AM = R('src/attention-model.js');
const { UserTodoManager } = R('src/user-todos.js');
const CHEAP = { N: 1024, r: 8, p: 1 };
const PW = 'correct horse battery staple';
const quiet = { log() {}, warn() {}, error() {} };
let seq = 0;
const dirOf = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const engines = [], stores = [];
const mkVault = (dataDir, o = {}) => { const e = VE.create({ dataDir, kdf: CHEAP, log: quiet, idleTimer: false, ...o }); engines.push(e); return e; };
const mkTodos = (d, clock) => { const t = new UserTodoManager({ dataDir: d, onChange: () => {}, expirySweepMs: 0, ...(clock ? { now: () => clock.t } : {}) }); stores.push(t); return t; };
const vaultRows = (t) => t.forSession('vault').filter((i) => i.action && i.action.type === 'vault-unlock');
const band = (i) => (AM.rowOf(i) || {}).band;
/** one hub life: a set-up dir locked at the shutdown, then a boot with the hooks wired → { v, t, clock } */
async function lockedBoot(H, tag) {
  const d = dirOf(tag); const clock = { t: BOOT };
  const v0 = mkVault(d, { now: () => clock.t }); await v0.setup(PW, {}); v0.lock('close', { quiet: true });
  clock.t += 1000;
  const v = mkVault(d, { now: () => clock.t }); const t = mkTodos(d, clock);
  H.wireVaultHooks({ vault: v, userTodos: t, log: quiet });
  return { v, t, clock, d };
}
async function itemLegs(H) {
  const out = {};
  { const d = dirOf('unset'); const v = mkVault(d); const t = mkTodos(d); H.wireVaultHooks({ vault: v, userTodos: t, log: quiet }); out.unset = vaultRows(t).length; }
  { const d = dirOf('open'); const v = mkVault(d); await v.setup(PW, {}); const t = mkTodos(d); H.wireVaultHooks({ vault: v, userTodos: t, log: quiet }); out.open = vaultRows(t).length; }
  const { v, t, clock } = await lockedBoot(H, 'boot');
  const boot = vaultRows(t);
  out.boot = boot.map((i) => ({ id: i.id, kind: i.kind, urgency: i.urgency, band: band(i), line: i.i18n && i.i18n.text && i.i18n.text.key }));
  out.badge = AM.badgeRows(boot.map((i) => AM.rowOf(i))).length;
  clock.t += 1000; await v.unlock(PW, {});
  out.afterUnlock = vaultRows(t).length;
  out.resolvedBy = boot[0] ? (t.get(boot[0].id) || {}).resolvedBy : null;
  clock.t += 1000; v.lock('door');
  const act = vaultRows(t);
  out.lockAct = act.map((i) => ({ id: i.id, band: band(i), line: i.i18n && i.i18n.text && i.i18n.text.key }));
  clock.t += 1000; v.blocked('Worker one', 'vibespace-api conversations.rename');
  const named = vaultRows(t);
  out.named = named.map((i) => ({ id: i.id, band: band(i), who: i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.who }));
  clock.t += 1000; await v.unlock(PW, {});
  await v.setIdleLock(1);
  clock.t += 2 * 3600e3; v.idleTick();
  out.idleState = v.state();
  out.idle = vaultRows(t).map((i) => ({ id: i.id, band: band(i) }));
  out.rows = t._state.items.filter((i) => i.sessionKey === 'vault' && i.action && i.action.type === 'vault-unlock').length;
  return out;
}
const H = R('src/server/vault-hooks.js');
{
  const o = await itemLegs(H);
  ok(o.unset === 0 && o.open === 0, 'not set up / unlocked at boot ⇒ no item (a hub that never set up a vault is told nothing)', o);
  ok(o.boot.length === 1 && o.boot[0].kind === 'action' && o.boot[0].urgency === 'urgent' && o.boot[0].line === H.LOCKED_TEXT, 'a LOCKED BOOT ⇒ ONE For-you item: an URGENT action row, «The vault is locked — agents that need a credential will be refused until you unlock it»', o.boot);
  ok(o.boot.length === 1 && o.boot[0].band === 1 && o.badge === 1, 'it is band 1 of the attention list (urgent) — the red badge counts it (the base\'s notice was band 0: never in the badge)', { band: o.boot[0] && o.boot[0].band, badge: o.badge });
  ok(o.afterUnlock === 0 && o.resolvedBy === 'vault', 'the UNLOCK resolves it (resolvedBy vault — nobody answers it by hand)', o);
  ok(o.lockAct.length === 1 && o.lockAct[0].id === o.boot[0].id && o.lockAct[0].band === 1 && o.lockAct[0].line === H.LOCKED_TEXT, 'a LOCK ACT files it again AT ONCE — the same row reopened, urgent — before anybody is refused', o.lockAct);
  ok(o.named.length === 1 && o.named[0].id === o.boot[0].id && o.named[0].band === 1 && o.named[0].who === 'Worker one (vibespace-api conversations.rename)', 'a refusal then names who on the SAME row (the .326 detail stays; still urgent)', o.named);
  ok(o.idleState === 'locked' && o.idle.length === 1 && o.idle[0].id === o.boot[0].id && o.idle[0].band === 1, 'the IDLE LOCK files it too, at the moment it locks', o);
  ok(o.rows === 1, 'one row, ever (every filing is the same id)', o.rows);
}

console.log('④ RED CONTROLS — the base, one each');
{
  // the dialog: the base asked at every load while locked (no set-aside lock — a reload after 「稍后」 asked again)
  const preDialog = (i) => { const s = L.vaultLoudState(i); return { ...s, dialog: s.locked && (i.on !== 'broadcast' || i.facts.startedAt !== i.seen) }; };
  const r1 = runTable(preDialog).filter((x) => !x.ok);
  ok(r1.length > 0 && r1.every((x) => x.row === 3), `RED: a table that ignores the set-aside lock fails row 4 (a reload after 「稍后」 asks again — the base) — ${r1.length} case(s) red`, r1.map((x) => x.input));
  const everyBroadcast = (i) => { const s = L.vaultLoudState(i); return { ...s, dialog: s.locked && i.dismissed !== s.lock }; };
  const r2 = runTable(everyBroadcast).filter((x) => !x.ok);
  ok(r2.length > 0 && r2.every((x) => x.row === 5), `RED: a table that asks at every broadcast fails row 6 (a lock act would pop the dialog over the page) — ${r2.length} case(s) red`);
  const noMark = (i) => ({ ...L.vaultLoudState(i), mark: false });
  ok(runTable(noMark).some((x) => !x.ok && x.row >= 2), 'RED: no ⚙ mark (the base) fails every locked row');
  // the item: the base filed a NOTICE at boot only (no lock-act filing)
  const M = mutantCopies('vault-loud', REPO);
  const src = read('src/server/vault-hooks.js');
  const a1 = "    vault.onLock(() => { if (loud()) fileItem(null); });";
  const a2 = "kind: 'action', urgency: 'urgent', by: 'agent'";
  ok(src.includes(a1) && src.includes(a2), 'the mutants\' anchors are the lock-act filing and the item\'s kind');
  const base = require(M.write('src/server/vault-hooks.js', src.replace(a1, '').replace(a2, "kind: 'notice', urgency: 'high', by: 'agent'"), 'base'));
  const b = await itemLegs(base);
  ok(b.boot.length === 1 && b.boot[0].band === 0 && b.badge === 0, 'RED: the base\'s boot item is a NOTICE — band 0, the badge counts nothing', b.boot);
  ok(b.lockAct.length === 0, 'RED: the base files NOTHING at a lock act (the owner learned of it first at a refusal)', b.lockAct);
  ok(b.idle.length === 0, 'RED: … nor at the idle lock', b.idle);
}

for (const t of stores) { try { t.stop(); } catch { } }
for (const e of engines) { try { e.close?.(); } catch { } }
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
