#!/usr/bin/env node
// DAY ONE (lane door-day-one-landing — two naive-user studies on fleet pods, 2.369.342: study 1 D5–D8, D10, D11; study 2
// C4–C9, C14, M3; lane 3's folder table). Fast, in-process:
//   ① tourSteps — a workspace the admin protects (SSO, a sign-in password) has no «Protect this workspace» step (nor its SSO
//     sentence); an unprotected one keeps it
//   ② folderChips over the testers' shape (a pod home: work/ with 23 files, Desktop, Downloads, a mount; the last session in
//     work/investor-relations): «work (23 files)» FIRST, then «the last one you used», then the home's other folders, then
//     the other recents; a Task Group's folders pinned before all; a path once; bounded — RED CONTROL: the base's chip rule
//     (the recent folders only) offers no folder with files
//   ③ firstFilesFolder — the tour's chat starts in the folder holding the most files
//   ④ vaultSetupAsk — day one (nothing stored) never asks; a stored secret asks; «Later» snoozes 3 days — RED CONTROL: the
//     base's rule (not set up ⇒ ask) asks on day one
//   ⑤ railLabels / railUsed — the first week, or until every door was used once
//   ⑥ gitIdentityPlan — git's name / email from the sign-in's account, never over git's own, never mixing two people
//   ⑦ the vault engine (real, temp data dir): no secret ⇒ secretWaiting false; a store's first key minted ⇒ true + a
//     vault-state broadcast; a boot over a key file / a device token (re-read ≤ every 5 s) ⇒ true; a refused store ⇒ true + a
//     broadcast; set up ⇒ false; no new engine key (test-vault-law untouched)
//   ⑧ the SafeFs op folderCensus over a temp home: files counted (nested, bounded), hidden / dependency folders skipped,
//     a folder on another device named, never walked; the cap says `more`
//   ⑨ git identity over a temp HOME with real git: set from ~/.claude.json's account; a second ask changes nothing; an
//     identity git already has is kept
//   ⑩ wiring pins (the tour, the dialog, the vault ask, the rail, the sign-in terminal, the title) + i18n zh / ja
// Run: node scripts/test-day-one.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const D = require(path.join(REPO, 'src/day-one.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const ROOT = scratch('day-one');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });

console.log('① the tour’s steps');
ok(D.tourSteps({}).join() === 'welcome,connect,protect,start', 'an unprotected workspace: welcome → connect → protect → start', D.tourSteps({}));
ok(D.tourSteps({ authEnabled: true }).join() === 'welcome,connect,start', 'a sign-in password already set (a provisioned pod): no protect step', D.tourSteps({ authEnabled: true }));
ok(D.tourSteps({ ssoEnabled: true }).join() === 'welcome,connect,start', 'SSO on: no protect step — its SSO sentence never shows', D.tourSteps({ ssoEnabled: true }));
ok(D.tourSteps({ ssoEnabled: true, authEnabled: true }).includes('connect'), 'the sign-in step stays (the owner: the Claude sign-in is per person — never skipped)');

console.log('② the folder chips (the testers’ pod home)');
const H = '/home/pod1';
const FOLDERS = [
  { name: 'Desktop', path: `${H}/Desktop`, files: 0 },
  { name: 'Downloads', path: `${H}/Downloads`, files: 0 },
  { name: 'my-storage', path: `${H}/my-storage`, files: null, mount: true },
  { name: 'work', path: `${H}/work`, files: 23 },
];
const RECENT = [`${H}/work/investor-relations`, `${H}/work/compute-deal`, `${H}/work/investor-relations/`];
const chips = D.folderChips({ folders: FOLDERS, recent: RECENT });
ok(chips[0] && chips[0].kind === 'files' && chips[0].path === `${H}/work` && chips[0].files === 23, 'THE FINDING: the folder holding the files is the FIRST chip («work (23 files)»)', chips[0]);
ok(chips[1] && chips[1].kind === 'last' && chips[1].path === `${H}/work/investor-relations`, '«the last one you used» comes next', chips[1]);
ok(chips.slice(2, 5).every((c) => c.kind === 'folder') && chips.slice(2, 5).map((c) => c.path.split('/').pop()).join() === 'Desktop,Downloads,my-storage', 'then the home’s other folders (a mount named, its count unknown)', chips.slice(2, 5));
ok(chips[5] && chips[5].kind === 'recent' && chips[5].path === `${H}/work/compute-deal`, 'then the other recent folders', chips[5]);
ok(new Set(chips.map((c) => c.path)).size === chips.length, 'a path once (a trailing slash is the same folder)', chips.map((c) => c.path));
{
  const two = D.folderChips({ folders: [...FOLDERS, { name: 'papers', path: `${H}/papers`, files: 40 }], recent: [] });
  ok(two[0].path === `${H}/papers` && two[1].path === `${H}/work`, 'two folders with files: the one with MORE files first', two.slice(0, 2).map((c) => c.path));
  const same = D.folderChips({ folders: FOLDERS, recent: [`${H}/work`] });
  ok(same[0].path === `${H}/work` && same[0].last === true && !same.some((c) => c.kind === 'last'), 'the last one used IS a home folder ⇒ that chip says so (no second chip)', same.slice(0, 2));
  const task = D.folderChips({ folders: FOLDERS, recent: RECENT, task: [{ path: `${H}/work/deal`, tip: 'Task Group folder (Deal)', color: '#4a8' }] });
  ok(task[0].kind === 'task' && task[1].kind === 'files', 'a Task Group’s own folders are pinned before everything', task.slice(0, 2).map((c) => c.kind));
  const many = D.folderChips({ folders: Array.from({ length: 20 }, (_, i) => ({ name: 'f' + i, path: `${H}/f${i}`, files: i + 1 })), recent: Array.from({ length: 20 }, (_, i) => `/r/${i}`) });
  ok(many.length === D.MAX_CHIPS && many.filter((c) => c.kind === 'files').length === D.HOME_CHIPS, `bounded: ${D.MAX_CHIPS} chips, at most ${D.HOME_CHIPS} home folders`, many.map((c) => c.kind));
  const hidden = D.folderChips({ folders: [{ name: '.cache', path: `${H}/.cache`, files: 900 }, ...FOLDERS], recent: [] });
  ok(!hidden.some((c) => c.path.endsWith('/.cache')), 'a hidden folder is never a chip');
  ok(D.folderChips({}).length === 0, 'nothing known ⇒ no chips (the field stays empty; typing works)');
  // RED CONTROL — the base's chip rule (src/lib/app.js _fillCwdRecent before this lane): the Task Group's folders, then the
  // recent session folders (≤ 8) — the home's folders were never offered
  const base = ({ recent = [], task = [] }) => [...task.map((t) => ({ path: t.path, kind: 'task' })), ...recent.slice(0, 8).map((p) => ({ path: p, kind: 'recent' }))];
  const b = base({ recent: RECENT });
  ok(!(b[0] && b[0].path === `${H}/work`) && !b.some((c) => c.path === `${H}/work`), 'RED CONTROL: the base’s rule offers no folder with files (its first chip is the previous area’s folder)', b[0]);
}

console.log('③ the tour’s first chat starts in the folder with the files');
ok(D.firstFilesFolder(chips) === `${H}/work`, 'firstFilesFolder = work/', D.firstFilesFolder(chips));
ok(D.firstFilesFolder(D.folderChips({ folders: [{ name: 'Desktop', path: `${H}/Desktop`, files: 0 }], recent: [] })) === null, 'no folder holds files ⇒ none chosen (the home, as before)');

console.log('④ the vault’s second password: only once a secret is stored');
const NOW = 1_800_000_000_000;
const ask = (facts, snoozedUntil = 0) => D.vaultSetupAsk({ facts, snoozedUntil, now: NOW });
ok(ask({ state: 'not_set_up', secretWaiting: false }) === false, 'THE FINDING: day one (not set up, nothing stored) ⇒ never asked');
ok(ask({ state: 'not_set_up', secretWaiting: true }) === true, 'a secret is stored with no vault ⇒ asked');
ok(ask({ state: 'not_set_up', secretWaiting: true }, NOW + 1000) === false, '«Later» snoozes it');
ok(ask({ state: 'not_set_up', secretWaiting: true }, NOW - 1) === true, '… until the snooze runs out');
ok(ask({ state: 'locked', secretWaiting: true }) === false && ask({ state: 'unlocked' }) === false && ask(null) === false, 'a set-up vault (locked / unlocked) or no facts ⇒ this ask never (the unlock ask is vault-loud’s)');
ok(D.vaultLaterUntil(NOW) - NOW === 3 * 24 * 3600e3, '«Later» = 3 days on this device');
{ // RED CONTROL — the base's rule (src/lib/vault-unlock.js maybeNagVault before this lane): not set up and not snoozed ⇒ ask
  const baseAsk = (facts, snoozed) => !!facts && facts.state === 'not_set_up' && !snoozed;
  ok(baseAsk({ state: 'not_set_up', secretWaiting: false }, false) === true, 'RED CONTROL: the base’s rule asks on day one (nothing stored)');
}

console.log('⑤ the rail’s words');
const DOORS = ['folders', 'tasks', 'agents', 'settings'];
{
  const first = D.railLabels({ record: null, now: NOW, doors: DOORS });
  ok(first.show === true && first.record.since === NOW && first.record.used.length === 0, 'the first sight: words shown, the week starts now', first);
  const day3 = D.railLabels({ record: { since: NOW, used: ['agents'] }, now: NOW + 3 * 24 * 3600e3, doors: DOORS });
  ok(day3.show === true, 'day 3, one door used: still shown');
  const week = D.railLabels({ record: { since: NOW, used: [] }, now: NOW + 7 * 24 * 3600e3, doors: DOORS });
  ok(week.show === false && week.record === D.RAIL_DONE && week.why === 'week', 'a week later: gone (done)', week);
  let r = { since: NOW, used: [] };
  for (const d of DOORS) r = D.railUsed(r, d);
  const used = D.railLabels({ record: r, now: NOW + 3600e3, doors: DOORS });
  ok(used.show === false && used.why === 'used', 'every door used once: gone, inside the week', used);
  ok(D.railLabels({ record: D.RAIL_DONE, now: NOW, doors: DOORS }).show === false && D.railUsed(D.RAIL_DONE, 'x') === D.RAIL_DONE, 'done stays done');
  ok(D.railUsed({ since: NOW, used: ['agents'] }, 'agents').used.length === 1, 'a door used twice counts once');
  ok(D.railLabels({ record: { since: 'x', used: 'y' }, now: NOW, doors: DOORS }).record.since === NOW, 'a garbled record starts the week afresh');
}

console.log('⑥ git’s identity from the sign-in’s account');
const ACC = { email: 'person@example.com', name: 'Pat Example' };
ok(JSON.stringify(D.gitIdentityPlan({ configured: {}, account: ACC })) === JSON.stringify({ email: 'person@example.com', name: 'Pat Example' }), 'nothing configured ⇒ both from the account');
ok(D.gitIdentityPlan({ configured: { name: 'Own Name', email: 'own@example.com' }, account: ACC }) === null, 'git already has an identity ⇒ nothing (never over it)');
ok(D.gitIdentityPlan({ configured: { email: 'other@example.com' }, account: ACC }) === null, 'git holds ANOTHER email ⇒ nothing (never two people mixed)');
ok(JSON.stringify(D.gitIdentityPlan({ configured: { email: 'PERSON@example.com' }, account: ACC })) === JSON.stringify({ name: 'Pat Example' }), 'git holds the same email, no name ⇒ the name only');
ok(D.gitIdentityPlan({ configured: {}, account: { email: 'person@example.com' } }).name === 'person', 'no display name ⇒ the email’s local part');
ok(D.gitIdentityPlan({ configured: {}, account: null }) === null && D.gitIdentityPlan({ configured: {}, account: { email: 'not an email' } }) === null, 'no sign-in / a malformed email ⇒ nothing');
ok(D.gitIdentityPlan({ configured: {}, account: { email: 'a@b.co', name: 'X\n[core]' } }).name === 'X[core]', 'a name cannot break a line');
ok(D.isSignInRow({ purpose: 'sign-in' }) && !D.isSignInRow({}) && !D.isSignInRow(null), 'isSignInRow: purpose sign-in only');

console.log('⑦ the vault engine: «a secret is waiting»');
{
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const SB = require(path.join(REPO, 'src/secret-box.js'));
  const CHEAP = { N: 1024, r: 8, p: 1 };
  const quiet = { log() {}, warn() {} };
  const dir = path.join(ROOT, 'vault-1'); fs.mkdirSync(dir, { recursive: true });
  const said = [];
  const e = VE.create({ dataDir: dir, kdf: CHEAP, log: quiet, idleTimer: false, bcast: (m) => said.push(m) });
  ok(e.facts().state === 'not_set_up' && e.facts().secretWaiting === false, 'a fresh hub: not set up, NOTHING waiting (day one — no ask)', e.facts());
  const r = SB.lawfulKey(path.join(dir, '.integrations-key'), { hasCiphertext: () => false });
  ok(r.ok && r.minted, 'a store’s first secret mints its key file (the migration window)', r.code);
  ok(e.facts().secretWaiting === true, 'THE MOMENT: the first secret stored ⇒ secretWaiting', e.facts());
  ok(said.some((m) => m.type === 'vault-state' && m.secretWaiting === true), '… announced at once (the page asks without a reload)', said.map((m) => m.secretWaiting));
  const n0 = said.length;
  SB.lawfulKey(path.join(dir, '.integrations-key'), { hasCiphertext: () => true });
  SB.lawfulKey(path.join(dir, '.channels-key'), { hasCiphertext: () => false });
  ok(said.length === n0, 'a second read / a second store’s key announces nothing more (one moment)', said.length - n0);
  e.close();
  const e2 = VE.create({ dataDir: dir, kdf: CHEAP, log: quiet, idleTimer: false });
  ok(e2.facts().secretWaiting === true, 'a BOOT over a key file left beside the data ⇒ waiting (a returning person is asked)');
  e2.close();
  const dir3 = path.join(ROOT, 'vault-3'); fs.mkdirSync(path.join(dir3, 'agentd'), { recursive: true }); fs.writeFileSync(path.join(dir3, 'agentd', 'host-abc123.token'), 'x');
  const e3 = VE.create({ dataDir: dir3, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
  ok(e3.facts().secretWaiting === true, 'a boot over a device’s link token file ⇒ waiting');
  e3.close();
  const dir4 = path.join(ROOT, 'vault-4'); fs.mkdirSync(dir4, { recursive: true });
  const said4 = [];
  const e4 = VE.create({ dataDir: dir4, kdf: CHEAP, log: quiet, idleTimer: false, register: false, bcast: (m) => said4.push(m) });
  const put = e4.secretPut('frp:token', 'x');
  ok(!put.ok && put.code === 'vault_not_set_up' && e4.facts().secretWaiting === true && said4.some((m) => m.secretWaiting), 'a store the vault REFUSED for want of one ⇒ waiting + announced', { put, f: e4.facts().secretWaiting });
  const dir5 = path.join(ROOT, 'vault-5'); fs.mkdirSync(path.join(dir5, 'agentd'), { recursive: true });
  let T = 1e12;
  const e5 = VE.create({ dataDir: dir5, kdf: CHEAP, log: quiet, idleTimer: false, register: false, now: () => T });
  ok(e5.facts().secretWaiting === false, 'a hub with no secret: nothing waiting');
  fs.writeFileSync(path.join(dir5, 'agentd', 'host-dev1.token'), 'x');   // a device paired with no vault (host-tokens' file road)
  T += 6000;
  ok(e5.facts().secretWaiting === true, 'a device\u2019s link token written since ⇒ waiting at the next facts read (re-read ≤ every 5 s)');
  ok(Object.keys(e5).every((k) => k !== 'noteSecret'), 'the engine exports NO new key (test-vault-law classifies every key — untouched)');
  const su = await e5.setup('a second password for the leg');
  ok(su.ok && e5.facts().state === 'unlocked' && e5.facts().secretWaiting === false, 'set up ⇒ the fact is gone (this ask never again)', { ok: su.ok, f: e5.facts() });
  e4.close(); e5.close();
}

console.log('⑧ the home’s folders (the SafeFs op)');
{
  const { runOp } = require(path.join(REPO, 'src/safe-fs-worker.js'));
  const home = path.join(ROOT, 'home');
  const mk = (rel, n) => { const d = path.join(home, rel); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < n; i++) fs.writeFileSync(path.join(d, `f${i}.txt`), 'x'); };
  mk('work', 20); mk('work/deal', 2); mk('work/deal/v4', 1); mk('Desktop', 0); mk('.cache', 50); mk('node_modules/x', 9); mk('work/.git', 30); mk('big', 0);
  for (let i = 0; i < 30; i++) mk(`big/d${i}`, 100);
  fs.writeFileSync(path.join(home, 'notes.txt'), 'x');
  try { fs.symlinkSync('/proc/self', path.join(home, 'procdir')); } catch { }
  const { folders } = runOp('folderCensus', { path: home, cap: 500 }).result;
  const by = Object.fromEntries(folders.map((f) => [f.name, f]));
  ok(by.work && by.work.files === 23 && by.work.more === false, '«work (23 files)»: nested files counted, the .git inside skipped', by.work);
  ok(by.Desktop && by.Desktop.files === 0, 'an empty folder: 0', by.Desktop);
  ok(!by['.cache'] && !by.node_modules && !by['notes.txt'], 'hidden folders, dependency folders and plain files are not folders here', Object.keys(by));
  ok(by.big && by.big.more === true && by.big.files <= 500, 'the walk is bounded (cap) and says `more`', by.big);
  ok(!by.procdir || (by.procdir.mount === true && by.procdir.files === null), 'a folder on another device (here: /proc) is named, never walked', by.procdir);
  const chips8 = D.folderChips({ folders, recent: [] });
  ok(chips8[0].path === path.join(home, 'big') || chips8[0].path === path.join(home, 'work'), 'the op’s answer feeds folderChips', chips8.slice(0, 2));
}

console.log('⑨ git identity over a temp HOME (real git)');
{
  const G = require(path.join(REPO, 'src/server/git-identity.js'));
  const home = path.join(ROOT, 'git-home'); fs.mkdirSync(home, { recursive: true });
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    let git = true; try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { git = false; }
    if (!git) { ok(true, 'SKIP: no git on this machine'); } else {
      const sys = (() => { try { return execFileSync('git', ['config', '--system', '--get', 'user.email'], { encoding: 'utf8', cwd: '/' }).trim(); } catch { return ''; } })();
      G._reset();
      const none = await G.ensureGitIdentity({ home, now: 1e9 });
      ok(none.skipped === 'no-sign-in', 'no sign-in yet ⇒ nothing', none);
      fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'person@example.com', displayName: 'Pat Example', organizationName: 'Org' } }));
      G._reset();
      const r = await G.ensureGitIdentity({ home, now: 2e9, log: { log() {} } });
      if (sys) ok(r.already || r.skipped, 'SKIP-ish: this machine’s SYSTEM git config has an identity (kept)', r);
      else {
        ok(r.set && r.set.email === 'person@example.com' && r.set.name === 'Pat Example', 'THE FIX: git’s name + email set from the sign-in’s account', r);
        const cfg = fs.readFileSync(path.join(home, '.gitconfig'), 'utf8');
        ok(/email = person@example\.com/.test(cfg) && /name = Pat Example/.test(cfg), '… written to the person’s global git config', cfg);
        G._reset();
        const again = await G.ensureGitIdentity({ home, now: 3e9 });
        ok(again.already === true, 'asked again ⇒ git has it ⇒ nothing changes', again);
        fs.writeFileSync(path.join(home, '.gitconfig'), '[user]\n\temail = someone-else@example.com\n');
        G._reset();
        const kept = await G.ensureGitIdentity({ home, now: 4e9 });
        ok(kept.already === true && fs.readFileSync(path.join(home, '.gitconfig'), 'utf8') === '[user]\n\temail = someone-else@example.com\n', 'an identity git already has (another email) is KEPT', kept);
      }
      const paced = await G.ensureGitIdentity({ home, now: 4e9 + 1000 });
      ok(paced.skipped === 'settled' || paced.skipped === 'paced', 'asked at every spawn, but at most once a minute / once settled', paced);
    }
  } finally { process.env.HOME = prevHome; G._reset(); }
}

console.log('⑩ wiring');
{
  const sf = read('src/lib/setup-flows.js');
  ok(!/ob-theme|ob-lang\b|setLang\(|BUILTIN_THEMES/.test(sf), 'THE FINDING (D5): no theme or language chips on day one (⚙ keeps both)');
  ok(!/t\('(?:Your workspace for coding agents|Sessions that never die|A real window manager|Every session can run as a structured chat or a raw terminal TUI\.)'\)/.test(sf), '… nor the coding-agent pitch');
  ok(/An assistant that works on your files — ask it in plain words\./.test(sf) && (sf.match(/class="ob-ask"/g) || []).length === 3, 'one plain sentence + three example asks');
  ok(/<p data-i18n>An assistant that works on your files — ask it in plain words\.<\/p>/.test(read('public/index.html')) && !/Multi-session terminal manager/.test(read('public/index.html')), 'the empty desktop\u2019s welcome says the same sentence (no terminal-manager pitch)');
  ok(/tourSteps\(\{ ssoEnabled: !!this\._ssoEnabled, authEnabled: !!this\._authEnabled \}\)/.test(sf) && /if \(step === 2 && !plan\.includes\('protect'\)\) step = 3;/.test(sf), 'the tour asks tourSteps (a protected workspace skips step 2)');
  ok(!/Single sign-on \(SSO\) is already configured/.test(sf), 'THE FINDING (D6): the SSO sentence is gone');
  ok(/firstFilesFolder\(chips\)/.test(sf) && /paintFolderChips\(chipsEl, chips, \{ selected: first/.test(sf), 'the start step: the home’s folders as chips, the one with files chosen');
  ok(/purpose: SIGN_IN \}\);/.test(sf), 'the tour’s guided login is a sign-in terminal');
  const app = read('src/lib/app.js');
  // lane new-session-group-folder-link: every open goes through PURE folderOnOpen (the caller's folder, a picked group's — derived —
  // or EMPTY), and the chips row is THE path field's own (chips: true — src/lib/path-field.js paints it through folderChips)
  const form = read('src/lib/new-session-form.js'), pf = read('src/lib/path-field.js');
  ok(/this\._nsFolderOpen\(cwd \|\| ''\);/.test(app) && /folderOnOpen\(\{ cwd, groups: this\._nsGroupFolders\(\)/.test(form) && !/if \(cwd\) document\.getElementById\('input-cwd'\)\.value = cwd;/.test(app), 'THE FINDING (D8): the dialog’s folder is the caller’s, the picked group’s or EMPTY — never the last dialog’s');
  ok(/kind: 'folder', chips: true, id: 'new-session-cwd'/.test(app) && /paintFolderChips\(chipsEl, folderChips\(\{ folders, recent, task \}\)/.test(pf) && /loadHomeFolders\(\)\.then/.test(pf), 'the dialog’s chips: folderChips over the home’s folders (the path field’s own row)');
  ok(/sessionGivenName\(match, this\.sidebar\.getCustomName\?\.\(match\)\) \|\| match\.name \|\| match\.webuiName/.test(app), 'THE FINDING (D10): the window title takes the first message before the generated «Session N»');
  const vu = read('src/lib/vault-unlock.js');
  ok(/vaultSetupAsk\(\{ facts, snoozedUntil, now: Date\.now\(\) \}\)/.test(vu) && !/sessionStorage\.(?:get|set)Item\('vs-vault-later'/.test(vu), 'THE FINDING (D7): the setup ask asks vaultSetupAsk; «Later» is per device (no per-tab snooze)');
  ok(/if \(on === 'broadcast' && !wasWaiting && f && f\.state === 'not_set_up' && f\.secretWaiting\) maybeNagVault\(\);/.test(vu), 'the broadcast of the first stored secret asks at once');
  const rail = read('src/lib/sidebar-rail.js');
  ok(/railLabels\(\{ record: readRailRecord\(\), now: Date\.now\(\), doors \}\)/.test(rail) && /cap\.className = 'rail-label';/.test(rail) && /this\._railDoorUsed\(id\)/.test(rail), 'THE FINDING (D11): the rail carries its words (railLabels), a press counts the door');
  ok(/'vs-rail-labels': 'done'/.test(read('scripts/scratch.mjs')), 'the chrome suites’ pages start with the rail’s words done (their 44 px pins)');
  ok(/if \(isSignInRow\(ws\)\) continue;/.test(read('src/lib/sidebar.js')), 'the sidebar lists no row for a sign-in terminal');
  ok(/_purpose: data\.purpose === DAY_ONE\.SIGN_IN \? DAY_ONE\.SIGN_IN : null/.test(read('src/ws-create.js')) && /purpose: session\._purpose \|\| undefined/.test(read('src/ws-create.js')), 'the server marks + persists a sign-in terminal');
  ok(/purpose: s\._purpose \|\| undefined/.test(read('server.js')), 'the live list carries it');
  ok(/if \(entry && entry\.pid && signInPids\.has\(entry\.pid\)\) continue;/.test(read('src/routes/sessions.js')), 'the claude a sign-in terminal runs is no discovered row');
  const ma = read('src/lib/manage-agents.js');
  ok((ma.match(/this\.openSignInTerminal\(/g) || []).length === 9 && /run\(selectedHost && b\.remoteLoginCmd \? b\.remoteLoginCmd : absCmd\(b\.loginCmd\), \{ signIn: true \}\)/.test(ma), 'every Manage Agents login terminal is a sign-in terminal (8 + the machine-wide Log in)');
  ok(/if \(!session\.host\) ensureGitIdentity\(\)\.catch\(\(\) => \{\}\);/.test(read('src/ws-create.js')), 'a local spawn asks for git’s identity (once)');
  ok(/router\.get\('\/api\/home-folders'/.test(read('src/routes/files.js')) && /folderCensus: 15000/.test(read('src/safe-fs.js')), 'the route + its SafeFs deadline');
  ok(/'src\/day-one\.js'/.test(read('scripts/test-architecture.mjs')), 'src/day-one.js is in test-architecture’s PURE set');
}
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const KEYS = ['An assistant that works on your files — ask it in plain words.', 'For example:', 'Read the contracts in my folder and list when each one renews.',
    'Check the numbers in this report against the spreadsheet and fix what is wrong.', 'Turn my notes into a one-page summary I can send.', 'Start your first chat',
    'Pick the folder with your files — the assistant works inside it', 'or type a folder…', 'Start the chat', 'or a terminal', '{name} (1 file)', '{name} ({n} files)',
    'Last used: {path}', 'The last one you used', 'Type a folder, or pick one below', 'A credential was just stored here — a second password keeps it sealed.', 'Diagnostics'];
  const has = (tbl, k) => tbl.includes('\n  ' + JSON.stringify(k) + ':');
  const miss = KEYS.filter((k) => !has(zh, k) || !has(ja, k));
  ok(miss.length === 0, `i18n: the ${KEYS.length} new words in zh + ja`, miss);
  ok(/"\{name\} \(\{n\} files\)": "\{name\}（\{n\} 个文件）"/.test(zh), 'zh: «work（23 个文件）»');
  ok(!/"Sessions that never die"|"Start Chat Session"|"Single sign-on \(SSO\) is already configured/.test(zh + ja), 'the old pitch’s and the SSO sentence’s words left both tables (§78)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
