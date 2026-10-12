#!/usr/bin/env node
// test-app-register-words — THE WORDS OF APP REGISTRATION, launcher half (lane app-register-ui, owner 2026-10-11: an
// agent-installed JASP sat under "Installed outside VibeSpace"; one press should make it VibeSpace's own, with its
// launch options and how to remove it — nothing a row runs hidden). In-process, PURE:
//   §1 src/argv-words.js — ONE line ↔ its words: quotes / escapes, refusals (| ; & > < $ ` outside quotes, unbalanced
//      quotes, a trailing backslash) with the index, the round trip splitWords(joinWords(a)) == a over a generated set;
//      CONTROL: a copy that lets `$` through outside quotes is caught by the refusal table
//   §2 the card's "…" rows by kind: 1 vs 3 variants (one variant = the press, no rows), witnessed ⇒ Add to VibeSpace…,
//      removable ⇒ Remove…, no recipe ⇒ Forget, an engine row ⇒ nothing; their words in en / zh
//   §3 the For-you REGISTRATION card: every argv verbatim on its face, the witness line both ways, the digest moves with
//      a variant's argument; an install card's digest fields keep their shape
//   §4 the adopt dialog's error placement + the launcher's wiring (a variant launch POSTs `variant`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T0 = Date.now();

console.log('§1 argv-words: one line ↔ its words');
const AW = require('../src/argv-words.js');
const SPLITS = [
  ['flatpak run org.jaspstats.JASP', ['flatpak', 'run', 'org.jaspstats.JASP']],
  ['  a   b  ', ['a', 'b']], ['', []], ['""', ['']], ["''", ['']],
  ['a "b c" d', ['a', 'b c', 'd']], ["it's 'x y'", null], ["'it'\\''s'", ["it's"]],
  ['a\\ b', ['a b']], ['"a\\"b"', ['a"b']], ['"\\$HOME"', ['$HOME']], ['"$HOME"', ['$HOME']], ['"a\\nb"', ['a\\nb']],
  ['x"y"z', ['xyz']], ['--opt=a\\|b', ['--opt=a|b']], ['"a|b;c&d>e<f"', ['a|b;c&d>e<f']],
];
for (const [line, want] of SPLITS) {
  const r = AW.splitWords(line);
  if (want === null) ok(!r.ok && r.code === 'bad_args', `${JSON.stringify(line)} ⇒ refused (unbalanced quote)`, r);
  else ok(r.ok && same(r.argv, want), `${JSON.stringify(line)} ⇒ ${JSON.stringify(want)}`, r);
}
const REFUSE = [['a | b', 2], ['a;b', 1], ['a & b', 2], ['a > f', 2], ['a < f', 2], ['echo $HOME', 5], ['echo `id`', 5], ['"open', 0], ["x 'open", 2], ['end\\', 3]];
const refusalsHold = (W) => REFUSE.every(([line, at]) => { const r = W.splitWords(line); return !r.ok && r.code === 'bad_args' && r.at === at; });
ok(refusalsHold(AW), `${REFUSE.length} lines a shell would read differently are refused as bad_args at the offending index`, REFUSE.map(([l]) => [l, AW.splitWords(l)]));
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const ALPH = ['a', 'Z', '0', '-', '.', '/', ' ', "'", '"', '\\', '$', '`', '|', ';', '&', '>', '<', '*', '\t', '=', 'é', '中'];
const gen = () => Array.from({ length: rnd(5) }, () => Array.from({ length: rnd(6) }, () => ALPH[rnd(ALPH.length)]).join(''));
const trips = Array.from({ length: 400 }, gen);
const bad = trips.filter((a) => { const r = AW.splitWords(AW.joinWords(a)); return !r.ok || !same(r.argv, a); });
ok(!bad.length, `round trip splitWords(joinWords(a)) == a over ${trips.length} generated argv arrays (quotes, backslashes, shell characters, empty words)`, bad.slice(0, 3));
ok(AW.joinWords(['flatpak', 'run', 'org.jaspstats.JASP']) === 'flatpak run org.jaspstats.JASP' && AW.joinWords(['a b', "it's"]) === "'a b' 'it'\\''s'", 'plain words stay bare; any other is single-quoted');
{ // CONTROL: the refusal table is a judge — a copy that lets `$` through outside quotes fails it
  const src = fs.readFileSync(path.join(repo, 'src/argv-words.js'), 'utf8');
  const line = "const SHELL_CHARS = '|;&><$`';";
  ok(src.split(line).length === 2, 'CONTROL: the shell-character line is spelled exactly once');
  const dir = scratch('app-register-words'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'argv-words-dollar.js'); fs.writeFileSync(f, src.replace(line, "const SHELL_CHARS = '|;&><`';"));
  ok(!refusalsHold(require(f)), 'CONTROL: the patched copy (`$` let through) is caught by the refusal table');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('§2 the card\'s "…" rows, by kind');
const I18N = await import('../src/lib/i18n.js');
const L = await import('../src/lib/desktop-app-launcher.js');
const reg = (n, extra = {}) => ({ id: 'reg.jasp', label: 'JASP', registered: true, removable: true, source: 'flatpak-user', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'],
  launch: Array.from({ length: n }, (_, i) => ({ id: i ? `v${i}` : 'open', label: i ? `Variant ${i}` : 'Open' })), ...extra });
const kinds = (m) => [m.head.map((x) => x.kind + (x.id ? ':' + x.id : '')), m.tail.map((x) => x.kind)];
ok(same(kinds(L.cardMenuModel(reg(1))), [[], ['remove', 'command']]), 'one variant ⇒ no "Open ·" rows (the card\'s press is it); Remove… + Show command', L.cardMenuModel(reg(1)));
ok(same(kinds(L.cardMenuModel(reg(3))), [['variant:open', 'variant:v1', 'variant:v2'], ['remove', 'command']]), 'three variants ⇒ three "Open ·" rows, the default first', L.cardMenuModel(reg(3)));
ok(L.cardMenuModel(reg(12)).head.length === 8, 'at most 8 variant rows');
ok(same(kinds(L.cardMenuModel(reg(2, { removable: false }))), [['variant:open', 'variant:v1'], ['forget', 'command']]), 'no remove recipe ⇒ Forget');
ok(same(kinds(L.cardMenuModel({ id: 'seen.f.org.jaspstats.jasp', witnessed: true, source: 'flatpak-user', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] })), [[], ['adopt']]), 'a witnessed card ⇒ Add to VibeSpace…');
ok(same(kinds(L.cardMenuModel({ id: 'xterm', exec: 'xterm', available: true })), [[], []]) && same(kinds(L.cardMenuModel({ id: 'x', witnessed: true, registered: true, launch: [{ id: 'a' }, { id: 'b' }] })), [[], ['adopt']]), 'an engine row ⇒ no rows; a witnessed row never offers variants');
const words = () => [L.cardMenuRowLabel({ kind: 'variant', label: 'Safe mode' }), L.cardMenuRowLabel({ kind: 'variant', label: 'Open', isDefault: true }), ...['adopt', 'remove', 'forget', 'command'].map((kind) => L.cardMenuRowLabel({ kind }))];
ok(same(words(), ['Open · Safe mode', 'Open', 'Add to VibeSpace…', 'Remove…', 'Forget', 'Show command']), 'the rows\' words (en) — the DEFAULT variant reads as its own label (never "Open · Open")', words());
ok(L.cardMenuModel(reg(3)).head.map((x) => !!x.isDefault).join() === 'true,false,false', 'only the first variant is the default row');
const zhC = (await import('../src/lib/i18n-zh.js')).default, jaC = (await import('../src/lib/i18n-ja.js')).default;
const tr = (cat) => (s, p) => String(cat[s] ?? s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : `{${k}}`));
const ROW_KEYS = ['Open · {variant}', 'Add to VibeSpace…', 'Remove…', 'Forget', 'Show command', 'Registered by an agent', 'Removed', 'Forgotten — the program is still on the machine', 'Add…', 'Add {app} to VibeSpace…', 'More for {app}', 'This runs as you: {cmd}'];
const untranslated = ROW_KEYS.filter((k) => !zhC[k] || !jaC[k] || zhC[k] === k || jaC[k] === k);
ok(!untranslated.length, `the rows' / chip's / toasts' ${ROW_KEYS.length} keys are translated in zh + ja`, untranslated);
ok(L.witnessSourceText('agent') === 'Registered by an agent', 'source "agent" ⇒ the chip "Registered by an agent"');
ok(L.removedToastText(false) === 'Removed' && L.removedToastText(true) === 'Forgotten — the program is still on the machine', 'Remove…\'s toast says which happened');
ok(L.recipeLine({ exec: 'flatpak', args: ['uninstall', '--user', '-y', 'org.jaspstats.JASP'] }) === 'flatpak uninstall --user -y org.jaspstats.JASP' && L.recipeLine(null) === '', 'a recipe is shown as ONE line, verbatim');

console.log('§3 the For-you registration card');
const C = require('../src/app-card.js');
const M = await import('../src/lib/app-card-model.js');
const t = I18N.t;
const prop = (args2 = ['run', '--command=jasp-safe', 'org.jaspstats.JASP'], witness = { source: 'flatpak-user', appId: 'org.jaspstats.JASP' }) => ({ id: 'ap-abc123', host: 'local', state: 'pending', by: { name: 'Helper' }, why: 'you asked for JASP',
  request: { kind: 'registered', label: 'JASP', path: '/usr/bin/flatpak', launch: [{ id: 'open', label: 'Open', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] }, { id: 'safe', label: 'Safe mode', exec: 'flatpak', args: args2 }],
    remove: { exec: 'flatpak', args: ['uninstall', '--user', '-y', 'org.jaspstats.JASP'] }, reinstall: { exec: 'flatpak', args: ['install', '--user', '-y', 'org.jaspstats.JASP'] }, witness }, app: { name: 'JASP' } });
const v = C.cardView(prop());
ok(v.kind === 'registered' && v.registered && v.registered.variants.length === 2 && v.registered.path === '/usr/bin/flatpak', 'cardView carries the registration (kind registered, path, 2 variants)', v);
const w = M.cardWords(v, t);
ok(w.title === 'Helper registered JASP' && w.from === 'Runs /usr/bin/flatpak', 'title "<agent> registered <label>" + the resolved program', w);
ok(same(w.argv, ['Open — flatpak run org.jaspstats.JASP', 'Safe mode — flatpak run --command=jasp-safe org.jaspstats.JASP', 'Remove: flatpak uninstall --user -y org.jaspstats.JASP', 'Reinstall: flatpak install --user -y org.jaspstats.JASP']), 'every variant as "label — exec args…" + the recipes, verbatim', w.argv);
ok(w.fromNote === 'already listed as Flatpak · yours: org.jaspstats.JASP' && M.cardWords(C.cardView(prop(undefined, null)), t).fromNote === 'a program the machine did not list — check the command', 'the witness line, both ways');
ok(w.go === 'Install' && w.later === 'Not now', 'the same Install / Not now as an install proposal');
const spaced = M.cardWords(C.cardView(prop(['run', 'a b', 'org.jaspstats.JASP'])), t).argv[1];
ok(spaced === "Safe mode — flatpak run 'a b' org.jaspstats.JASP", 'an argument with a space is shown quoted (the words it really is)', spaced);
ok(C.shownDigest(v) !== C.shownDigest(C.cardView(prop(['run', '--command=other', 'org.jaspstats.JASP']))), 'the digest moves with a variant\'s argument (what you approve is what runs)');
const pkg = C.cardView({ id: 'ap-000001', request: { kind: 'apt', packages: ['gimp'] }, app: { name: 'GIMP' } });
ok(!pkg.registered && C.shownFields(pkg).length === 27, 'an install card has no registration and its digest fields keep their shape (27)', C.shownFields(pkg).length);
const ja = M.cardWords(v, tr(jaC));
ok(ja.title !== w.title && ja.argv[0] === w.argv[0], 'ja: the words translate, the argv never does', ja);
const row = await import('../src/lib/user-todos-row.js').catch(() => null);
if (row && row.appCardHtml) { const html = row.appCardHtml({ card: v }, t, { buttons: false }); ok(w.argv.every((l) => html.includes(l.replace(/'/g, '&#39;')) || html.includes(l)), 'the For-you row draws every argv line on its face (ut-app-argv)', html.slice(0, 600)); }

console.log('§4 the adopt dialog\'s error placement + the launcher\'s wiring');
ok(same(['bad_label', 'shadow', 'bad_icon', 'needs_root', 'bad_exec', 'bad_args', 'too_many_variants'].map((code) => L.adoptErrorField({ code })), ['label', 'label', 'label', 'remove', 'launch', 'launch', 'launch']) && L.adoptErrorField({ code: 'needs_root', field: 'reinstall' }) === 'reinstall', 'each refusal code lands under its field (the answer\'s own field wins)');
const bv = L.argvLineVerdict('jasp | tee log');
ok(!bv.ok && /character 6/.test(bv.error), 'a line that cannot be read says where, in words', bv);
const src = fs.readFileSync(path.join(repo, 'src/lib/desktop-app-launcher.js'), 'utf8');
ok(/launch\(\{ appId: row\.id, variant: x\.id \}, null\)/.test(src), 'WIRING: an "Open ·" row launches through the same door with `variant`');
ok(/sayErr\(f, \(r && r\.error\)/.test(src) && /const f = adoptErrorField\(r \|\| \{\}\);/.test(src), 'WIRING: an adopt refusal is said under its field (never a toast alone)');
ok(/message: forget \?[^\n]*\n\s*: rec \? t\('This runs as you: \{cmd\}', \{ cmd: rec \}\)/.test(src), 'WIRING: Remove… confirms with the recipe verbatim');

// rel254 verify F9 / F10: a refused line NAMES the character; invisible characters shown; NBSP kept; POSIX continuation
{
  const RG = require('../src/app-kinds/registered.js');
  const q = AW.splitWords('flatpak run "org.x.Y');
  ok(!q.ok && q.error === 'unbalanced quote at 13' && q.at === 12, 'F9: an unbalanced quote is named with its place (1-based)', q);
  const p = AW.splitWords('a b | c');
  ok(!p.ok && p.error === 'a | outside quotes at 5', 'F9: a | outside quotes is named', p);
  ok(AW.splitWords('a\\').error === 'a trailing \\ at 2', 'F9: a trailing backslash is named');
  const nb = AW.splitWords('/opt/My\u00a0App/run --x');
  ok(nb.ok && nb.argv.length === 2 && nb.argv[0] === '/opt/My\u00a0App/run', 'F10: a no-break space stays inside its word (a path may hold it)', nb);
  ok(JSON.stringify(AW.splitWords('a \\\nb').argv) === '["a","b"]' && JSON.stringify(AW.splitWords("'a \\\nb'").argv) === '["a \\\\\\nb"]', 'F10: backslash-newline outside quotes is a continuation; inside quotes it is kept', [AW.splitWords('a \\\nb'), AW.splitWords("'a \\\nb'")]);
  const w = ['x\u202ey', 'zero\u200bwidth', 'nb\u00a0sp', 'tab\tin'];
  ok(JSON.stringify(AW.splitWords(AW.joinWords(w)).argv) === JSON.stringify(w), 'the round trip still holds for invisible characters');
  ok(AW.commandLine({ exec: '/x', args: ['a\u202eb'] }) === "/x 'a<U+202E>b'" && AW.commandLine({ exec: '/x', args: [], env: { K: 'v w' }, cwd: '/tmp' }) === "env K='v w' /x (in /tmp)", 'F10/F3: the display shows <U+202E>, env and cwd', AW.commandLine({ exec: '/x', args: ['a\u202eb'] }));
  const V = (label, vl) => RG.validateRegistered({ label, launch: [{ exec: '/bin/true', ...(vl ? { label: vl } : {}) }, { exec: '/bin/true', label: vl || 'Two' }] }, { resolve: (x) => x });
  ok(V('Fire\u200bfox').code === 'bad_label' && V('A\u202eB').code === 'bad_label' && V('ok', 'v\u2028w').code === 'bad_label' && V('JASP').ok, 'F10: a label / variant name with a zero-width / bidi / line-separator character is bad_label');
  ok(RG.ROOT_WORDS.includes('sudoedit') && RG.validateRegistered({ label: 'X', launch: [{ exec: '/bin/true' }], remove: { exec: 'sudoedit', args: ['/etc/x'] } }, { resolve: (x) => x }).code === 'needs_root', 'F5: sudoedit is a root word');
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
