#!/usr/bin/env node
// B-acb9 — A PLUGIN'S WINDOW OPENS A BROWSER PROFILE'S OWN «Proxy…» AND «Check the exit…» (the owner asked in the custom kernel's
// Studio window, 2026-11-19): two CORE commands of the Ph1 registry, src/lib/browser-profile-commands.js. In-process, no DOM:
//   ① both commands are registered by their ids and offered only with a profile (`when`)
//   ② run with a profile: the dialog opens on the profile's OWN row, with the app the caller handed (else globalThis.app); the
//      caller hears ONE word, once — 'done' after one of the dialog's own saves, 'cancelled' after any other close — never a value
//   ③ a profile this instance does not have, or a malformed id: no dialog, the person is told, the caller hears 'cancelled'
//   ④ a caller's onDone that throws never breaks the run
//   ⑤ the dialogs: both take onClose and say 'done' only after their own saves (never at Cancel) — read on their text
//   ⑥ the wiring: the profiles panel registers them with the real dialogs and the profiles list; docs/plugins.md names them
//   RED CONTROL (it proves its plant first, through anchored()): a copy whose close always says 'done' ⇒ ②'s cancel leg is red
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first (it is a generated file)'); process.exit(1); }
const C = await import('../src/lib/contributions.js');
const P = await import('../src/lib/browser-profile-commands.js');
const ROW = { id: 'bp-0000abcd', label: 'Shop', proxy: 'socks5://proxy.example.test:1080', proxyCredential: 'proxy-login:socks5://proxy.example.test:1080#me' };
// the stand-ins: a dialog that records how it was opened and lets the leg close it; the profiles list; the person's toast
const world = () => {
  const w = { opened: [], said: [], heard: [], asked: [] };
  const dialog = (kind) => (app, row, opts) => { w.opened.push({ kind, app, row, opts }); };
  w.deps = { openProxy: dialog('proxy'), openExit: dialog('exit'), rowOf: async (id) => { w.asked.push(id); return id === ROW.id ? { ...ROW } : null; }, notFound: (id) => w.said.push(id), titles: { proxy: () => 'Proxy…', exit: () => 'Check the exit…' } };
  return w;
};

console.log('① the two commands, offered only with a profile');
const W1 = world();
P.registerBrowserProfileCommands(W1.deps);
ok(C.hasCommand('browser.profileProxy') && C.hasCommand('browser.profileExitCheck') && P.PROFILE_DIALOG_COMMANDS.every((id) => C.listCommands().includes(id)), 'browser.profileProxy and browser.profileExitCheck are core commands of the registry');
const whenOf = (id) => C.getCommand(id).when;
ok(P.PROFILE_DIALOG_COMMANDS.every((id) => whenOf(id)({ profileId: ROW.id }) === true && whenOf(id)({}) === false && whenOf(id)(undefined) === false), '…offered only with a profile — never bare in a palette');
ok(C.commandTitle('browser.profileProxy') === 'Proxy…' && C.commandTitle('browser.profileExitCheck') === 'Check the exit…', '…titled with the card\'s own words');
{ let msg = ''; try { P.registerBrowserProfileCommands({ ...W1.deps, titles: {} }); } catch (e) { msg = String(e && e.message); }
  ok(/titles\.proxy and titles\.exit/.test(msg) && C.listCommands().filter((id) => P.PROFILE_DIALOG_COMMANDS.includes(id)).length === 2, '…and their titles are the page\'s words, required: no English fallback, nothing registered twice', msg); }

console.log('② a profile: its own row, one word back — done after a save, cancelled after any other close');
for (const [id, kind] of [['browser.profileProxy', 'proxy'], ['browser.profileExitCheck', 'exit']]) {
  const heard = [], app = { name: 'the-app' };
  const opened = await C.runCommand(id, { profileId: ROW.id, app, onDone: (...a) => heard.push(a) });
  const o = W1.opened.at(-1);
  ok(opened === true && !!o && o.kind === kind && o.app === app && o.row.id === ROW.id && o.row.proxy === ROW.proxy && typeof o.opts.onClose === 'function' && W1.asked.at(-1) === ROW.id,
    `${id}: the card's own dialog opens on the profile's OWN row (read by its id), with the caller's app`, { opened, kind: o && o.kind, row: o && o.row && o.row.id });
  o.opts.onClose('done'); o.opts.onClose('cancelled');
  ok(heard.length === 1 && heard[0].length === 1 && heard[0][0] === 'done', `${id}: after a save the caller hears ONE word, once — 'done' (no row, no proxy, no login, no exit)`, heard);
  const heard2 = [];
  await C.runCommand(id, { profileId: ROW.id, app, onDone: (w) => heard2.push(w) });
  W1.opened.at(-1).opts.onClose('cancelled');
  const heard3 = [];
  await C.runCommand(id, { profileId: ROW.id, app, onDone: (w) => heard3.push(w) });
  W1.opened.at(-1).opts.onClose(undefined);
  ok(heard2.length === 1 && heard2[0] === 'cancelled' && heard3.length === 1 && heard3[0] === 'cancelled', `${id}: a close without a save — Cancel, Esc, ✕, or a close that says nothing — is 'cancelled'`, { heard2, heard3 });
}
{
  const before = globalThis.app; globalThis.app = { name: 'the-global-app' };
  await C.runCommand('browser.profileExitCheck', { profileId: ROW.id, onDone: () => { } });
  const o = W1.opened.at(-1); globalThis.app = before;
  ok(!!o && !!o.app && o.app.name === 'the-global-app', 'a caller that hands no app: the dialog gets the page\'s own (globalThis.app — the exit dialog reads the check address from its settings)', o && o.app);
}

console.log('③ a profile this instance does not have — or no id — opens nothing, says so, and answers cancelled');
for (const profileId of ['bp-0000dead', 'bp-NOTANID', '', undefined]) {
  const n = W1.opened.length, heard = [];
  const r = await C.runCommand('browser.profileProxy', { profileId, onDone: (w) => heard.push(w) });
  ok(r === false && W1.opened.length === n && heard.length === 1 && heard[0] === 'cancelled' && W1.said.at(-1) === String(profileId || ''), `${JSON.stringify(profileId)}: no dialog, the person is told, the caller hears 'cancelled'`, { r, opened: W1.opened.length - n, heard, said: W1.said.at(-1) });
}
ok(!W1.asked.includes('bp-NOTANID') && !W1.asked.includes(''), '…a malformed id is never even asked of the profiles list');
{
  const long = 'x'.repeat(60), heard = [];
  await C.runCommand('browser.profileProxy', { profileId: long, onDone: (w) => heard.push(w) });
  ok(W1.said.at(-1) === 'x'.repeat(40) + '…' && heard[0] === 'cancelled', '…an over-long malformed id is cut to 40 characters in what the person is told', W1.said.at(-1));
  // THE LIST COULD NOT BE READ (r226 should): the person hears the server did not answer — never that the profile is missing
  const noReply = [], notFound = [], heardN = [];
  const runN = P.profileDialogRun(() => { throw new Error('never opened'); }, { rowOf: async () => { throw new Error('503'); }, notFound: (id) => notFound.push(id), noReply: () => noReply.push(1) });
  const rN = await runN({ profileId: ROW.id, onDone: (w) => heardN.push(w) });
  ok(rN === false && noReply.length === 1 && notFound.length === 0 && heardN.length === 1 && heardN[0] === 'cancelled', 'a profiles list that could not be read: «the server did not answer» (never «missing»), no dialog, the caller hears cancelled', { noReply, notFound, heardN });
}

console.log('④ a caller\'s onDone that throws never breaks the run');
{
  let threw = null;
  try { await C.runCommand('browser.profileProxy', { profileId: ROW.id, onDone: () => { throw new Error('the plugin\'s own'); } }); W1.opened.at(-1).opts.onClose('done'); } catch (e) { threw = e; }
  ok(threw === null, 'an onDone that throws is the caller\'s own: the run and the close go on', threw && threw.message);
}

console.log('⑤ the dialogs say done only after their own saves — the FORM\'s word, the same for a raised second caller');
for (const [f, saves] of [['src/lib/browser-proxy-dialog.js', 2], ['src/lib/browser-exit-dialog.js', 2]]) {
  const s = read(f);
  const facts = {
    set: /\nconst SAVED = new WeakSet\(\);\n/.test(s),
    sig: /export function open(Proxy|Exit)Dialog\(app, r, \{ onDone = null, onClose = null \} = \{\}\) \{/.test(s),
    hook: /onClose: \(\) => \{ try \{ onClose\?\.\(sh && SAVED\.has\(sh\.overlay\) \? 'done' : 'cancelled'\); \} catch \{ \/\* the caller's own \*\/ \} \}/.test(s),
    handed: /\n  sh = shell;\n  if \(shell\.raised\) return shell;\n/.test(s),
    saves: (s.match(/SAVED\.add\(shell\.overlay\);\n\s+shell\.close\(\);\n\s+try \{ onDone\?\.\(\); \}/g) || []).length,
    noLocal: !/let saved\b|saved = true/.test(s),
    cancel: /const cancel = btn\(t\('Cancel'\), \(\) => shell\.close\(\), 'bnew-cancel'\);/.test(s),
  };
  ok(facts.set && facts.sig && facts.hook && facts.handed && facts.saves === saves && facts.noLocal && facts.cancel, `${f}: the word is the FORM's (a WeakSet of overlays its ${saves} saves add to, right before their close), read through the handle a raise hands back — no local flag left; Cancel only closes`, facts);
}

console.log('⑥ the wiring');
{
  const tv = read('src/lib/browser-trace-view.js');
  ok(/import \{ registerBrowserProfileCommands \} from '\.\/browser-profile-commands\.js';/.test(tv) && /registerBrowserProfileCommands\(\{\n  openProxy: openProxyDialog, openExit: openExitDialog, titles: \{ proxy: \(\) => t\('Proxy…'\), exit: \(\) => t\('Check the exit…'\) \},\n  rowOf: async \(id\) => \{ const d = await fetchJson\('\/api\/browser\/profiles'\); if \(!d \|\| d\.error \|\| !Array\.isArray\(d\.profiles\)\) throw new Error/.test(tv) && /\n  noReply: \(\) => showToast\(t\('The browser profiles could not be read — the server did not answer; try again'\)/.test(tv),
    'the profiles panel registers them with the card\'s real dialogs and the profiles list (the row the card itself draws)');
  const docs = read('docs/plugins.md');
  ok(P.PROFILE_DIALOG_COMMANDS.every((id) => docs.includes(id)), 'docs/plugins.md names both commands for a plugin');
}

console.log('RED CONTROL — a copy whose close always says done');
{
  const src = read('src/lib/browser-profile-commands.js');
  const ANCHOR = "open((c && c.app) || appOf(), row, { onClose: (how) => tell(how) });";
  const mut = anchored(src, ANCHOR, "open((c && c.app) || appOf(), row, { onClose: () => tell('done') });", 'every close is done');
  ok(mut !== src && !mut.includes(ANCHOR) && mut.includes("onClose: () => tell('done')"), 'CONTROL setup: the plant is where it claims — the close\'s word handed through is gone from the copy');
  const M = mutantCopies('profile-commands-close', REPO);
  const Pm = await import(pathToFileURL(M.write('src/lib/browser-profile-commands.js', mut, 'close-always-done', { esm: true })).href);
  const W2 = world(), heard = [];
  await Pm.profileDialogRun(W2.deps.openProxy, { rowOf: W2.deps.rowOf, notFound: W2.deps.notFound })({ profileId: ROW.id, onDone: (w) => heard.push(w) });
  W2.opened.at(-1).opts.onClose('cancelled');
  ok(heard.length === 1 && heard[0] === 'done', 'CONTROL: that copy tells a plugin «done» after a Cancel — ②\'s cancel leg is red on it', heard);
}
report();
