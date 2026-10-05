#!/usr/bin/env node
// WHO IS THIS — src/channel-authors.js (fast, PURE; lane lark-threads PART B, 2026-10-01). The rules N1–N5 as tables:
// the owner's own name wins (N1), else the vendor's way — the organization's nickname else the name, then the chosen
// profile field in parentheses (N2: "Ada (Marketing)"), the vendor name never rewritten (N3), an external author says so
// (N4), every string bounded through the name door (N5); controls (scripts/mutant-copy.mjs): a view that REWRITES the
// vendor name (N3 red), one where the vendor's way beats the owner's name (N1 red), one that trusts an unbounded alias (N5 red).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/channel-authors.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');
const A = require(path.join(REPO, MODEL));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } return !!c; };
const usern = { id: 'ou_usern', name: 'userN', alt: { nickname: 'Ada', department: 'Marketing', jobTitle: 'GTM lead', enName: 'userN' } };

function legRules(M, tag = '') {
  const r = {};
  const v = M.authorView(usern, { field: 'department' });
  r.n2 = ok(v.display === 'Ada (Marketing)' && M.authorView(usern, { field: 'jobTitle' }).display === 'Ada (GTM lead)' && M.authorView(usern, { field: 'none' }).display === 'Ada' && M.authorView({ id: 'ou_x', name: 'Xia' }, { field: 'department' }).display === 'Xia' && M.authorView({ id: 'ou_y', name: 'Yan', alt: { department: 'Ops' } }, {}).display === 'Yan (Ops)', `${tag}N2 the vendor's way: the nickname else the name, then (department) / (job title) per the setting; nothing to add ⇒ the name alone`, v);
  const al = M.authorView(usern, { field: 'department', alias: 'Ada from GTM' });
  r.n1 = ok(al.display === 'Ada from GTM' && al.alias === 'Ada from GTM' && al.vendorDisplay === 'Ada (Marketing)', `${tag}N1 the owner's own name wins over everything; the vendor's way kept beside it (a cleared name restores it)`, al);
  r.n3 = ok(v.name === 'userN' && al.name === 'userN' && M.titleFacts(al).name === 'userN' && M.titleFacts({ name: 'userN', display: 'userN' }).name === '', `${tag}N3 the vendor name is never rewritten — it is the title whenever the head shows another`, M.titleFacts(al));
  const ex = M.authorView({ id: 'ou_e', name: 'E' }, { selfTenant: 'tn_own', tenant: 'tn_other' });
  const same = M.authorView({ id: 'ou_s', name: 'S' }, { selfTenant: 'tn_own', tenant: 'tn_own' });
  const unk = M.authorView({ id: 'ou_u', name: 'U' }, { selfTenant: null, tenant: 'tn_other' });
  const bot = M.authorView({ id: 'cli_b', name: 'Bot b', isBot: true }, { selfTenant: 'tn_own', tenant: 'tn_other' });
  r.n4 = ok(ex.external === true && !same.external && !unk.external && !bot.external && M.authorView({ id: 'x', name: 'x', external: true }, {}).external === true && M.titleFacts(ex).external, `${tag}N4 external = the sender's organization is not the account's (both known); unknown ⇒ never guessed; a bot is not a person of an organization`, [ex.external, same.external, unk.external]);
  const big = M.authorView({ id: 'i'.repeat(9999), name: 'n'.repeat(9999), alt: { nickname: '<b>' + 'k'.repeat(9999), department: 'd'.repeat(9999) } }, { alias: 'a'.repeat(9999), field: 'department' });
  r.n5 = ok(big.alias.length <= M.ALIAS_MAX && big.display.length <= M.DISPLAY_MAX && big.alt.nickname.length <= 200 && M.cleanAlias('  x‮​ ') === 'x' && M.cleanAlias(null) === '' && M.cleanAlias('​') === '' && M.cleanAlias('\u200c\u200d') === '' && M.authorView({ id: 'ou_j', name: '\u200c', alt: { nickname: '\u200d\u200c' } }, {}).display === 'ou_j' && M.authorView({ id: 'ou_p', name: 'می\u200cخواهم' }, {}).display === 'می\u200cخواهم', `${tag}N5 bounded through the name door: an alias ≤ ${M.ALIAS_MAX}, a display ≤ ${M.DISPLAY_MAX}, every alternative ≤ 200; invisible / bidi characters dropped; nothing visible ⇒ no name (verify r2 ⑥: a name of JOINERS alone is no name — the head falls to the id — while a word that needs its ZWNJ keeps it)`, { a: big.alias.length, d: big.display.length });
  r.alt = ok(JSON.stringify(M.cleanAlt({ nickname: '', enName: 'E', junk: 'x' })) === JSON.stringify({ enName: 'E' }) && M.cleanAlt({}) === null && M.cleanAlt('x') === null && JSON.stringify(M.NAME_FIELDS) === JSON.stringify(['none', 'department', 'jobTitle']), `${tag}the alternatives: only the declared keys, only non-empty; the closed set of fields`);
  return r;
}
console.log('① the rules');
legRules(A);
ok(!/\brequire\(\s*['"](?!\.\/channel-record\.js)/.test(SRC) && !/Date\.now|process\.|\bfs\b/.test(SRC.replace(/^\s*(\*|\/\/).*$/gm, '')), 'the module is PURE: it imports only channel-record (the name door), reads no clock / process / fs');
console.log('② controls (patched copies in scratch)');
const M = mutantCopies('chan-authors', REPO);
const patch = (from, to, tag) => { if (!SRC.includes(from)) throw new Error(`control ${tag}: the anchor is gone`); return M.load(MODEL, SRC.replace(from, to), tag); };
const quiet = (fn) => { const P = pass, F = fail; const saved = console.log, savedE = console.error; console.log = () => {}; console.error = () => {}; let r; try { r = fn(); } finally { console.log = saved; console.error = savedE; } pass = P; fail = F; return r; };
{
  const C1b = M.load(MODEL, SRC.replace("  out.display = al || out.vendorDisplay;", "  out.display = al || out.vendorDisplay;\n  out.name = out.display;"), 'name-overwritten');
  const r1 = quiet(() => legRules(C1b, 'CONTROL '));
  ok(r1.n3 === false, 'CONTROL a view that overwrites the vendor name with the head: N3 goes red (the title / the search key / the filter\'s match would be lost)');
  const C2 = patch('  out.display = al || out.vendorDisplay;', '  out.display = out.vendorDisplay || al;', 'vendor-wins');
  ok(quiet(() => legRules(C2, 'CONTROL ')).n1 === false, 'CONTROL the vendor\'s way ahead of the owner\'s name: N1 goes red');
  const C3 = patch("  return peerName(String(v), ALIAS_MAX) || '';", "  return String(v);", 'alias-raw');
  ok(quiet(() => legRules(C3, 'CONTROL ')).n5 === false, 'CONTROL an alias stored as typed (no door, no bound): N5 goes red');
}
console.log('③ verify r3 (T2 ④): a vendor id is never a name — the avatar of an id-only author');
{
  const win = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf8');
  ok(/avatar\(\{ name: a\.display \|\| a\.name \|\| '', key: authorKey\(rec\), self: !!a\.isSelf(?:, pic)? \}, null, 'chanmsg-av'\)/.test(win) && !/avatar\(\{ name: [^}]*\|\| a\.id\b/.test(win), 'WIRING: the window\'s avatar is drawn from the display / vendor name only — never from `a.id` (an `ou_…` id drew the initial "O", a `cli_…` id "C", as if they were names; the id stays the head\'s text)');
  const AV = await import(path.join(REPO, 'src/lib/channel-avatar.js'));
  ok(AV.initialsOf('ou_ff8c53730c347e160493771728962528') === 'O' && AV.initialsOf('cli_a5ed0d009') === 'C' && AV.initialsOf('') === '?' && AV.avatarOf({ name: '', key: 'ou_ff8c' }).text === '?' && AV.avatarOf({ name: '', key: 'ou_ff8c' }).hue === AV.avatarOf({ name: 'userN', key: 'ou_ff8c' }).hue, 'the PURE fact that makes the wiring matter: initialsOf takes the first letter of ANY string (an id included), so the name must be empty for the "?" — the hue stays the author key\'s (stable across a later naming)');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: 'chan-authors: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
