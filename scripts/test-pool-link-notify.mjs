#!/usr/bin/env node
// A PER-SESSION POOL LINK THAT MOVES SAYS SO (lane badge-stale, 2026-09-30 — the owner's window said
// "全部 → Mat Max" 30+ minutes after the pool engine had moved the conversation to UCI Max).
//
// The link's target is a fact every client caches: the `active-sessions` payload's `auth.poolTarget` reads it
// (server.js poolAuth → accounts.poolMemberOfSession → poolCurrentFor → readlink), and that frame is the page's
// ONLY source of `auth`. `setPoolTarget` notified (→ onChange → broadcastActiveSessions); the per-session writer
// `ensureSessionPoolLink` notified nobody, so the page kept the member of the last frame until some unrelated
// broadcast went out (a conversation in a long running turn produces none). The rule, on a REAL AccountManager:
//   §1 ensureSessionPoolLink ⇒ onSessionLinks ONCE, after the synchronous pass (the link already on the new
//      member when it fires); N re-points in one pass ⇒ ONE notification; a later pass ⇒ its own; a throwing
//      hook never fails the re-point; no hook ⇒ no throw
//   §2 noteDeviceRepoint (the daemon's sealed-orders re-point, recorded late): a per-session row ⇒ onSessionLinks,
//      a default row ⇒ onChange (the list's `current` moved too), a replayed duplicate ⇒ nothing
//   §3 CONTROL: the pre-fix accounts.js (scripts/mutant-copy.mjs — ensureSessionPoolLink without its notify)
//      moves the link and says NOTHING: §1's first assertion fails on it
//   §4 THE WRITER CENSUS over the comment-stripped tree: every re-point of a pool credential link in accounts.js
//      sits in a method that notifies (or in a helper whose every caller does); no other server file re-points a
//      pool link (the daemon's re-point arrives through noteDeviceRepoint); server.js wires onSessionLinks to
//      broadcastActiveSessions
// In-process, fake subscriptions (fake token files) in a scratch dataDir. ~0.2 s
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const tick = () => new Promise((r) => setImmediate(r));
const ROOT = scratch('badge-link');
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const warn = console.warn; console.warn = () => { };
let n = 0;
/** A store with two fake members in a pool; counts both notifications. */
const mk = (AccountManager, { hook = true } = {}) => {
  const dataDir = path.join(ROOT, 'd' + (++n));
  fs.mkdirSync(dataDir, { recursive: true });
  const seen = { links: 0, changes: 0, targetsAtLinks: [] };
  const am = new AccountManager({ dataDir, onChange: () => { seen.changes++; }, ...(hook ? { onSessionLinks: () => { seen.links++; seen.targetsAtLinks.push(am.poolCurrentFor(pool, 'sess-1')); } } : {}) });
  const fake = (name) => { const a = am.createSubscription({ name }); fs.writeFileSync(path.join(am.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + a.id, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
  const A = fake('Alpha Max'), B = fake('Beta Max');
  const pool = am.createPool({ name: '全部', members: [A, B] }).id;
  am.setPoolTarget(pool, A);
  return { am, A, B, pool, seen };
};

console.log('§1 ensureSessionPoolLink notifies, once per burst');
const { AccountManager } = require('../src/accounts.js');
{
  const { am, A, B, pool, seen } = mk(AccountManager);
  await tick();
  seen.links = 0; seen.changes = 0; seen.targetsAtLinks = [];
  am.ensureSessionPoolLink(pool, 'sess-1', A, { why: 'spawn' });
  am.ensureSessionPoolLink(pool, 'sess-1', B, { why: 'per-session-switch' });
  ok(seen.links === 0, 'nothing fires INSIDE the synchronous pass (the engine re-points several conversations in one tick)');
  await tick();
  ok(seen.links === 1 && seen.targetsAtLinks[0] === B, 'ONE notification after the pass, the link already on the new member when it fires', seen);
  ok(seen.changes === 0, '…and no accounts-updated (the account list did not change — a link is not in it)', seen);
  for (let i = 0; i < 6; i++) am.ensureSessionPoolLink(pool, 'sess-' + (i % 3), i % 2 ? A : B, { why: 'per-session-switch' });
  await tick();
  ok(seen.links === 2, 'six re-points of three conversations in one pass ⇒ one more frame, not six', seen);
  am.ensureSessionPoolLink(pool, 'sess-1', A, { why: 'per-session-switch' });
  await tick();
  ok(seen.links === 3 && seen.targetsAtLinks[2] === A, 'a later pass gets its own notification', seen);
  am.setPoolTarget(pool, B, { why: 'pool-switch' });
  await tick();
  ok(seen.changes === 1 && seen.links === 3, 'the pool DEFAULT keeps its own path (setPoolTarget → onChange, as before)', seen);
  // a throwing hook never fails the move
  const t = mk(AccountManager);
  t.am._onSessionLinks = () => { throw new Error('boom'); };
  let threw = null; try { t.am.ensureSessionPoolLink(t.pool, 'sess-x', t.B, { why: 'per-session-switch' }); } catch (e) { threw = e; }
  await tick();
  ok(!threw && t.am.poolCurrentFor(t.pool, 'sess-x') === t.B, 'a throwing hook never fails the re-point (routing around a dead account is the pool\'s whole job)', threw && threw.message);
  const h = mk(AccountManager, { hook: false });
  let threw2 = null; try { h.am.ensureSessionPoolLink(h.pool, 'sess-y', h.B); } catch (e) { threw2 = e; }
  await tick();
  ok(!threw2, 'a store built without the hook (every suite, the migrations) re-points without it', threw2 && threw2.message);
}

console.log('§2 noteDeviceRepoint (the daemon\'s re-point, recorded after the fact)');
{
  const { am, A, B, pool, seen } = mk(AccountManager);
  am.ensureSessionPoolLink(pool, 'sess-1', A, { why: 'spawn' });
  await tick();
  seen.links = 0; seen.changes = 0;
  const at = Date.now();
  const row = am.noteDeviceRepoint({ link: am.sessionPoolLinkPath(pool, 'sess-1'), poolId: pool, from: am.subDir(A), to: B, at, why: 'sealed-orders' });
  await tick();
  ok(row && row.sessionId === 'sess-1' && seen.links === 1 && seen.changes === 0, 'a per-session row ⇒ onSessionLinks (the payload\'s auth.poolTarget moved)', { row, seen });
  const dup = am.noteDeviceRepoint({ link: am.sessionPoolLinkPath(pool, 'sess-1'), poolId: pool, from: am.subDir(A), to: B, at, why: 'sealed-orders' });
  await tick();
  ok(dup === null && seen.links === 1, 'a replayed duplicate (the daemon re-delivers until acked) records nothing and says nothing', seen);
  const drow = am.noteDeviceRepoint({ link: path.join(am.dataDir, 'subs', pool), poolId: pool, from: am.subDir(A), to: B, at: at + 1, why: 'sealed-orders' });
  await tick();
  ok(drow && drow.sessionId === null && seen.changes === 1, 'a default row ⇒ onChange (the list\'s `current` moved as well as every linkless conversation)', { drow, seen });
}

console.log('§3 CONTROL: the pre-fix writer');
const MUT = mutantCopies('badge-link', REPO);
{
  const src = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const NOTIFY = /\n[ \t]*this\._notifyLinks\(\);[^\n]*(\n[ \t]*return link;)/;
  ok(NOTIFY.test(src) && src.match(/this\._notifyLinks\(\);/g).length === 2, 'the notify is spelled once in ensureSessionPoolLink (+ once in noteDeviceRepoint) — the control patches exactly it');
  const { AccountManager: Pre } = MUT.load('src/accounts.js', src.replace(NOTIFY, '$1'), 'pre-fix');
  const { am, B, pool, seen } = mk(Pre);
  await tick();
  seen.links = 0;
  am.ensureSessionPoolLink(pool, 'sess-1', B, { why: 'per-session-switch' });
  await tick(); await tick();
  ok(am.poolCurrentFor(pool, 'sess-1') === B && seen.links === 0, 'the pre-fix writer moves the link and says NOTHING — §1\'s first assertion is red on it (the owner\'s chip, from the source)', seen);
  ok(MUT.files.length === 1 && !path.relative(REPO, MUT.files[0]).startsWith('src'), 'the patched copy lives outside the checkout', MUT.files);
}

console.log('§4 the writer census');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1'); // block comments keep their newlines (line numbers stay the file's)
  const acc = strip(fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8'));
  const lines = acc.split('\n');
  const methodAt = (i) => { for (let j = i; j >= 0; j--) { const m = /^  (?:async )?([A-Za-z_$][\w$]*)\([^)]*\)? *\{?\s*$/.exec(lines[j]) || /^  (?:async )?([A-Za-z_$][\w$]*)\(.*\) \{$/.exec(lines[j]); if (m && !/^(if|for|while|switch|catch|return)$/.test(m[1])) return m[1]; } return null; };
  const bodyOf = (name) => { const i = lines.findIndex((l) => new RegExp('^  (?:async )?' + name + '\\(').test(l)); if (i < 0) return ''; const out = []; for (let j = i; j < lines.length; j++) { out.push(lines[j]); if (j > i && /^  \}\s*$/.test(lines[j])) break; } return out.join('\n'); };
  const sites = [];
  lines.forEach((l, i) => { if (/repointPoolSymlink\(/.test(l) && !/^\s*(const|let|var)\b.*require/.test(l)) sites.push({ line: i + 1, method: methodAt(i) }); });
  // a helper that does not notify itself is fine only when EVERY caller of it does (named, with its reason)
  const VIA_CALLER = { _healPoolsAfterRemoval: 'remove' };
  const notifies = (name) => /this\._notify(Links)?\(\)/.test(bodyOf(name));
  const judged = sites.map((s) => {
    if (notifies(s.method)) return { ...s, ok: true, by: s.method };
    const caller = VIA_CALLER[s.method];
    const callers = lines.map((l, i) => (new RegExp('this\\.' + s.method + '\\(').test(l) ? methodAt(i) : null)).filter(Boolean);
    return { ...s, ok: !!caller && callers.length > 0 && callers.every((c) => c === caller) && notifies(caller), by: caller, callers };
  });
  ok(sites.length >= 4 && judged.every((s) => s.ok), `every re-point of a pool link in accounts.js notifies (${judged.map((s) => `${s.method}:${s.line}${s.by !== s.method ? ' via ' + s.by : ''}`).join(', ')})`, judged.filter((s) => !s.ok));
  ok(/this\._noteSlot\(\{ sessionId: sessKey, poolId, from, to: memberId, why \}\);\s*\n\s*this\._notifyLinks\(\);\s*\n\s*return link;/.test(bodyOf('ensureSessionPoolLink')), 'ensureSessionPoolLink: re-point → slot row → notify → return (the ONE per-session writer)');
  ok(/if \(sessionId\) this\._notifyLinks\(\); else this\._notify\(\);/.test(bodyOf('noteDeviceRepoint')), 'noteDeviceRepoint: a per-session row → the links hook, a default row → onChange');
  ok(/setImmediate\(/.test(bodyOf('_notifyLinks')) && /this\._linksNotifyArmed/.test(bodyOf('_notifyLinks')), '_notifyLinks coalesces a burst (one armed setImmediate)');
  // no other server file re-points a pool credential link (browser-env re-points BROWSER config links; the
  // daemon's reflex runs on the device and lands here through noteDeviceRepoint)
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []));
  const callers = walk(path.join(REPO, 'src')).filter((f) => /repointPoolSymlink\(/.test(strip(fs.readFileSync(f, 'utf8')))).map((f) => path.relative(REPO, f)).sort();
  const KNOWN = { 'src/accounts.js': 'THE store (judged above)', 'src/account-material.js': 'the primitive itself', 'src/agentd/agentd.js': 'the device reflex — recorded via noteDeviceRepoint', 'src/server/browser-env.js': 'browser config links, not pool links' };
  ok(callers.every((f) => KNOWN[f]) && callers.includes('src/accounts.js'), `the re-point census: ${callers.join(', ')} — a new caller must be judged here`, callers.filter((f) => !KNOWN[f]));
  const srv = strip(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'));
  const ctor = /new AccountManager\(\{[\s\S]*?\n\}\);/.exec(srv);
  ok(!!ctor && /onSessionLinks: \(\) => broadcastActiveSessions\(\),/.test(ctor[0]), 'WIRING PIN: server.js hands the store onSessionLinks → broadcastActiveSessions (the frame the page reads auth from)');
}
console.warn = warn;
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
