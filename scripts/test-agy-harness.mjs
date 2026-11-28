#!/usr/bin/env node
// B-7e49 (lane bl-vault, 主开发 r2347): THE FAST HALF — ① the descriptor, ①b agy's slash list, ⑨ named accounts, ⑩ the /usage
// reading, ⑪ the executable (⑩ and ⑪ keep their short node children: the capture script 5 times, the wrapper's argv 6 times).
// The legs that drive the REAL wrapper through a chat over the fake agy (② – ⑧, ⑫ – ⑲) moved VERBATIM to the heavy
// twin scripts/test-agy-harness-wrappers.mjs; both files judge themselves at their end against ONE table of legs
// (scripts/lib/agy-harness-legs.mjs): each its own half, disjoint, whole — the 208 marks of the suite before the split. The
// header below describes the whole suite as it stood before the split.
// THE ANTIGRAVITY CLI HARNESS (lane antigravity-harness). The descriptor re-derived from what agy 1.4.3 MEASURED
// (scripts/fixtures/antigravity-cli-1.4.3.json), then the REAL data/bin/agy-wrapper.js drives the fake agy
// (scripts/fixtures/antigravity-agy, the headless stream-json contract) over plain pipes, and the journal it writes is
// read back through the ACP normalizer the harness shares:
//   ① the descriptor rows ⇄ the fixture (every flag the adapter passes is one agy's --help lists; effort / mode values;
//     the docs' model slugs; the derived never-armed auto-resume row; the job door's agy names)
//   ② one chat turn: the conversation id adopted from agy's init, the text, a tool step as a tool card, result = turn end,
//     the version recorded per spawn; the ACP normalizer renders the journal
//   ①b agy's OWN slash commands (lane agy-slash-guard-paths): ONE closed list = the measured fixture's, PURE, the wrapper's
//     one source; the table — a command answers its name, a line that starts with a path (the attachment's) or any other
//     "/…" is text — + its RED control (the base's first-character rule: the attachment message is «/home»)
//   ③ THE SLASH REFUSAL + its RED control (a wrapper copy that forwards it: agy ends the stream, exit 2)
//   ④ THE SOFT-DENY CARD + Allow once and retry (one turn with the bypass, then back) / Keep skipped / stale + its RED control
//     (a copy whose stderr reader drops it: the skip is silent); ④b the one-turn bypass never reaches a reordered user
//     turn + its RED control; ④c on a named account the rule door writes the ACCOUNT's settings.json (never through a
//     link — RED copy) and the auth notice names the account's sign-in door
//   ⑨ named accounts through the REAL accounts store: the HOME root + its farm, stat-only sign-in, the spawn env, the
//     remote refusal, the default, Sign in again, export without the login, remove never following a link
//   ⑩ the /usage reading: the judge's STOP rule (any turn sign ⇒ turn-started) + RED copy, no parser before a signed-in
//     capture, and scripts/agy-usage-capture.mjs against the fake agy (exit 2 / 0 / 3, redacted, the account env)
//   ⑤ a model / mode switch RESTARTS agy on the same conversation (--conversation), the next reply on the new flags
//   ⑥ Stop = restart on the same conversation, the turn ends cancelled; the queue's remove / edit
//   ⑦ resume (--conversation from the start), an agent error (AGY_ERROR + result ERROR), a text-only stream
//   ⑧ THE AUTH GATE: an unauthenticated agy is refused in seconds by name, and never gets a user line as its code
//   ⑫ THE SUBAGENT CARD (lane agy-subagent-cards): over a fixture agy store (scripts/fixtures/agy-store), the
//     invoke_subagent row → the `subagent` card record (linked by the task's spawning step), the sub's steps as `sub`
//     records, the row's own end, the card ending on the sub's answer (elapsed, files), the tail ON only while a sub
//     works and OFF after + its RED copy; an older agy (no subagent_info, no store) ⇒ no card, no error; no transcript ⇒
//     the db's rows (node:sqlite read-only) are the timeline; the ACP normalizer draws the card and the virtual session
//   ⑭ THE LIVE LANE (lane agy-peer-wake): the 'peer-message' frame — idle ⇒ a turn (the wake) with the «Message from»
//     head, busy ⇒ queued (a notification says steer:'unsupported'), no text ⇒ nothing, while agy restarts ⇒ queued and
//     delivered to the new process, not signed in ⇒ ok:false with its words, the queue at exit ⇒ back with its words; the
//     advert (peerMessage + notificationSteer:false) and the census of the answers (started early, run beside the rest)
// ⑮–⑲ lane agy-harness-fixes-2 (the owner 2026-10-25 — five linked bugs; started early, run beside the rest, each leg with
//   its RED copy): ⑮ THE MODE THROUGH THE RING — a chip-picked mode + a 1.2 MB reply: the journal's head (the `session`
//   record) is cut, the sidecar keeps meta.modes, chatStatus answers the mode AND its list (the base reader: an empty list);
//   ⑯ THE RESUME — the session's sidecar deleted (the hub's teardown), a new wrapper on the same conversation with no stated
//   mode runs in the conversation's own (--dangerously-skip-permissions), a stated mode wins (the base: agy's default);
//   ⑰ «required» is no tool: jetski's «a tool required the "command" permission» names `command` on the card and the retry;
//   ⑱ NO FALSE CARD on a nudge turn whose tool steps all completed, nor under bypass — a step never completed still gets
//   it; ⑲ A STOPPED PROCESS IS NEVER AN ERROR — steer / Stop: the old agy's «interrupted» raises nothing, while one from the
//   CURRENT process (no restart) is still said
// Run: node scripts/test-agy-harness.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { LEGS, FILES, trackLegs, judge, controls } from './lib/agy-harness-legs.mjs';   // B-7e49 (主开发 r2347): the ONE table of this suite's legs and its twin's
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const WRAPPER = path.join(REPO, 'data/bin/agy-wrapper.js');
const STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/antigravity-cli-1.4.3.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = scratchDir('agy-harness');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
// a wrapper COPY lives at <root>/data/bin beside <root>/src → the repo's src, so its require of src/agy-store.js resolves
// (lane agy-subagent-cards: the wrapper's store parser is the shared module)
const MUTBIN = path.join(ROOT, 'data', 'bin');
fs.mkdirSync(MUTBIN, { recursive: true });
try { fs.symlinkSync(path.join(REPO, 'src'), path.join(ROOT, 'src')); } catch { }
const CLEAN_ENV = { ...process.env };
// THE CALLER'S OWN CONVERSATION IS NOT THIS SUITE'S (int402, 2026-11-14): a suite started from inside an agent
// conversation inherits the hub's injected CLAUDE_WEBUI_* names; the wrapper reads CLAUDE_WEBUI_SESSION_ID to keep a picture
// with its conversation when the cwd is temporary, so with the name left in, the picture leg wrote under data/chat-attachments/
// of the CALLER's conversation and was red. Every name the hub injects is dropped; a leg that wants one sets it itself.
for (const k of Object.keys(CLEAN_ENV)) if (/^VIBESPACE_|^ACP_WEBUI_|^AGY_|^CLAUDE_CODE_|^CLAUDE_WEBUI_/.test(k)) delete CLEAN_ENV[k];

const H = require(path.join(REPO, 'src/harnesses/index.js'));
const g = H.get('antigravity');
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const { HARNESS_SETTINGS } = require(path.join(REPO, 'src/harness-settings.js'));
const { AgyAdapter, agyFlags, AGY_MODES, AGY_EFFORTS } = require(path.join(REPO, 'src/adapters/agy.js'));
const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
const HE = require(path.join(REPO, 'src/harness-env.js'));
const AS = require(path.join(REPO, 'src/agy-store.js'));   // the timing pair (2.369.405): the card a tail tick settles on, by the store's own cardOf

const LEG = trackLegs(console);   // B-7e49: each printed mark counted under its section's heading (judged at ⓣ)
console.log('— ① the descriptor, re-derived from what agy 1.4.3 measured');
{
  const helpFlags = Object.keys(FX.help.flags);
  ok('the executable is `agy` (cli-env resolves exe.command; ANTIGRAVITY_CMD overrides), the chat wrapper is agy\'s own', g.exe.command === 'agy' && g.wrapper === 'data/bin/agy-wrapper.js' && g.Adapter === AgyAdapter && verdictOf(fs.existsSync(path.join(REPO, g.wrapper))));
  ok('the journal is the ACP one: caps.streamProtocol acp-events + the ACP normalizer (agy itself is not ACP)', capsOf('antigravity').streamProtocol === 'acp-events' && g.Normalizer === AcpMessageManager && g.caps === capsOf('antigravity'));
  const all = agyFlags({ model: 'm', effort: 'max', permissionMode: 'plan', resumeId: 'c-1' });
  ok('every flag the adapter passes is one agy 1.4.3 --help lists', gateOf(['--model', '--effort', '--mode', '--conversation', '--dangerously-skip-permissions', '--prompt-interactive', '--input-format', '--output-format'].every((f) => helpFlags.includes(f))) && verdictOf(all.filter((a) => a.startsWith('--')).every((f) => helpFlags.includes(f))), all);
  ok('effort values = the binary\'s low|medium|high|xhigh|max (the docs said three)', AGY_EFFORTS.join('|') === 'low|medium|high|xhigh|max' && verdictOf(/low\|medium\|high\|xhigh\|max/.test(FX.help.flags['--effort'])));
  // lane effort-menu-per-harness: a level agy does not have is REFUSED BY NAME (it used to ride as no --effort at all, without a word)
  { let e = null; try { agyFlags({ effort: 'ultracode' }); } catch (x) { e = x; }
    ok('an effort agy does not have (claude\'s ultracode) THROWS effort_not_supported naming agy\'s levels — never dropped', e?.code === 'effort_not_supported' && JSON.stringify(e.levels) === JSON.stringify([...AGY_EFFORTS]) && verdictOf(/"ultracode"/.test(e.message)), e?.message);
    ok('the descriptor declares the SAME array as its effort menu (ui.effortLevels), no extras', g.ui.effortLevels === AGY_EFFORTS && !g.ui.effortExtras); }
  ok('our modes onto agy\'s: accept-edits / auto / plan = --mode (the binary\'s values), bypass = --dangerously-skip-permissions', gateOf(AGY_MODES.filter((m) => m !== 'bypassPermissions').every((m) => FX.help.flags['--mode'].includes(m)))
    && JSON.stringify(agyFlags({ permissionMode: 'bypassPermissions' })) === '["--dangerously-skip-permissions"]' && JSON.stringify(agyFlags({ permissionMode: 'default' })) === '[]');
  const ad = new AgyAdapter(g.adapterConfig({ acpCommands: { antigravity: '/opt/agy' }, acpWrapper: '/w/acp-wrapper.js', ptyWrapper: '/w/pty' }));
  const term = ad.buildSessionArgs({ mode: 'terminal', model: 'gemini-4-argon-high', effort: 'high', permissionMode: 'auto', resumeId: 'c-9' });
  ok('terminal = agy\'s TUI: --model / --effort / --mode / --conversation', term.cmd === '/opt/agy' && JSON.stringify(term.args) === JSON.stringify(['--model', 'gemini-4-argon-high', '--effort', 'high', '--mode', 'auto', '--conversation', 'c-9']) && term.wrapper === '/w/pty', term);
  // Gemini 4 Carbon (agy 1.5.5, 2026-11-10) rides both roads as typed
  const carbC = ad.buildSessionArgs({ mode: 'chat', model: 'gemini-4-carbon-medium', permissionMode: 'auto' }), carbT = ad.buildSessionArgs({ mode: 'terminal', model: 'gemini-4-carbon-high', permissionMode: 'auto' });
  ok('Gemini 4 Carbon: the wrapper env (chat) and --model (terminal), as typed', carbC.env.AGY_WEBUI_MODEL === 'gemini-4-carbon-medium' && verdictOf(carbT.args.join(' ').includes('--model gemini-4-carbon-high')));
  // A SLUG AGY OFFERS THAT IS NOT GEMINI is typeable through Custom… TODAY (the question of 2026-11-10): no provider record
  // serves the antigravity harness (accountProviderId → null ⇒ the menu is OPEN: the harness judges its own spellings),
  // resolvePick passes the id as typed, the descriptor carries it; the wrapper leg that runs it to agy's argv is the heavy twin's ⑦ (B-7e49)
  {
    const MPx = require(path.join(REPO, 'src/model-providers.js'));
    const pick = MPx.resolvePick(null, 'claude-opus-5-5-low'), menu = MPx.menuOf(null, [{ id: '', label: 'Default' }, { id: 'gemini-4-carbon-medium', label: 'x' }]);
    const nonG = ad.buildSessionArgs({ mode: 'chat', model: 'gpt-oss-120b-medium', permissionMode: 'auto' });
    ok('a non-Gemini slug agy offers (claude-opus-5-5-low, gpt-oss-120b-medium) passes every door on the way: no provider for the harness, an open menu, resolvePick as typed, the wrapper env',
      MPx.accountProviderId({ backend: 'antigravity' }) === null && menu.open === true && pick.ok === true && pick.model === 'claude-opus-5-5-low' && nonG.env.AGY_WEBUI_MODEL === 'gpt-oss-120b-medium', JSON.stringify({ pick, open: menu.open }));
  }
  const chat = ad.buildSessionArgs({ mode: 'chat', model: 'gemini-4-argon-high', permissionMode: 'bypassPermissions', resumeId: 'c-9' });
  ok('chat = the agy wrapper with the facts in AGY_WEBUI_* (never argv)', chat.wrapper === '/w/agy-wrapper.js' && chat.env.AGY_WEBUI_MODEL === 'gemini-4-argon-high' && chat.env.AGY_WEBUI_MODE === 'bypassPermissions' && chat.env.AGY_WEBUI_RESUME_ID === 'c-9' && chat.args.length === 0, chat);
  { // lane agy-gemini-4-carbon: the table = the docs' slugs (provenance «docs», in the docs' order) + the rows agy 1.5.5 listed
    // for a signed-in account (provenance «measured», 2026-11-10), each once — nothing else
    const AR = require(path.join(REPO, 'src/harnesses/antigravity.js')).AGY_MODEL_ROWS;
    const prov = (p) => AR.filter((r) => r[1] === p).map((r) => r[0]).join();
    const MEASURED = ['gemini-4-carbon-medium', 'gemini-4-carbon-high', 'gemini-4-carbon-low', 'gemini-4-argon-low', 'gemini-3.8-flash-low'];
    ok('the model table = the docs\' slugs (provenance «docs», their order) + the rows agy 1.5.5 listed signed in (provenance «measured») — each once, nothing else (agy models needs a sign-in — measured)',
      g.models().slice(1).map((m) => m.id).join() === AR.map((r) => r[0]).join() && prov('docs') === FX.models.slugs.join() && prov('measured') === MEASURED.join()
      && gateOf(AR.every((r) => r[1] === 'docs' || r[1] === 'measured')) && new Set(AR.map((r) => r[0])).size === AR.length && verdictOf(/sign in/i.test(FX.unauthenticated.models)));
  }
  const tbl = HARNESS_SETTINGS.antigravity;
  ok('settings: the table IS the descriptor\'s; its effort / mode options are agy\'s own values', g.settings === tbl && gateOf(tbl.rows.find((r) => r.key === 'defaultEffort').options.filter((o) => o.value).every((o) => AGY_EFFORTS.includes(o.value)))
    && verdictOf(tbl.rows.find((r) => r.key === 'defaultPermissionMode').options.filter((o) => o.value).every((o) => AGY_MODES.includes(o.value))));
  ok('auto-resume: a limit signal (the wall, lane agy-wall-signal) and NO resume verb ⇒ derived never offered', JSON.stringify(capsOf('antigravity').autoResume) === JSON.stringify({ signal: true, resume: null, supported: false }));
  ok('commit 2 = named Google accounts, each its own HOME root (localOnly, nothing shipped); still no pool', !!g.creds && g.creds.spawnForm === 'isolated-home' && g.creds.localOnly === true && g.creds.files.length === 0 && capsOf('antigravity').pool === false);
  ok('the job door strips agy\'s login names (GEMINI_API_KEY / AGY_ADC_AUTH / GOOGLE_GEMINI_BASE_URL — names the binary holds)', verdictOf(['GEMINI_API_KEY', 'AGY_ADC_AUTH', 'GOOGLE_GEMINI_BASE_URL'].every((n) => HE.VENDOR_CREDENTIAL_ENV.includes(n) && FX.env.names.includes(n))));
}

console.log('— ①b agy\'s OWN slash commands: ONE closed list (the measured fixture), a line that starts with a path is text');
{
  const SL = require(path.join(REPO, 'src/harnesses/antigravity-slash.js'));
  const modSrc = fs.readFileSync(path.join(REPO, 'src/harnesses/antigravity-slash.js'), 'utf8');
  const wSrc = fs.readFileSync(WRAPPER, 'utf8');
  ok('the list IS the one agy 1.4.3 measured (the fixture\'s slashInPrint.answeredWithoutATurn — its own changelog), frozen; the descriptor exports the SAME array',
    JSON.stringify(SL.AGY_SLASH_COMMANDS) === JSON.stringify(FX.slashInPrint.answeredWithoutATurn) && FX.slashInPrint.provenance === 'changelog' && gateOf(Object.isFrozen(SL.AGY_SLASH_COMMANDS))
    && require(path.join(REPO, 'src/harnesses/antigravity.js')).AGY_SLASH_COMMANDS === SL.AGY_SLASH_COMMANDS, SL.AGY_SLASH_COMMANDS);
  ok('the module is PURE (no require, no import — the wrapper loads it beside src/) and names the fixture it was measured from',
    !/\brequire\(|\bimport\b/.test(modSrc.replace(/^\s*\/\/.*$/gm, '')) && verdictOf(modSrc.includes('scripts/fixtures/antigravity-cli-1.4.3.json')));
  ok('ONE definition: the wrapper requires that module and its guard asks agySlashCommand — no first-character test, no list of its own',
    gateOf(wSrc.includes("require(path.join(__dirname, '..', '..', 'src', 'harnesses', 'antigravity-slash.js'))")) && gateOf(wSrc.includes('  const word = agySlashCommand(text);\n')) && !wSrc.includes('^\\/[A-Za-z]') && !wSrc.includes("'/credits'"));
  const CMD = [['/model', '/model'], ['/usage opus', '/usage'], ['/help', '/help'], ['  /MODEL', '/model'], ['/Config\nthe next line', '/config'], ['/credits　全角空格', '/credits'], ...SL.AGY_SLASH_COMMANDS.map((c) => [c, c])];
  const TEXT = ['/home/u/x.zip 这里是…', '/tmp/a.txt', '~/x', './run.sh', '../up.sh', '/ 2', '/2026', '/notacommand hello', '/models', '/model/x', '/usage.txt', 'hello /model', '', null, undefined];
  const bad = CMD.filter(([t, w]) => SL.agySlashCommand(t) !== w).concat(TEXT.filter((t) => SL.agySlashCommand(t) !== null).map((t) => [t, SL.agySlashCommand(t)]));
  ok(`the table: ${CMD.length} command lines answer their command (any case, args after whitespace); ${TEXT.length} lines are TEXT — the attachment's path first, /tmp/a.txt, ~/x, ./run.sh, "/ 2", /2026, /notacommand, /models, /model/x, /usage.txt`, bad.length === 0, bad);
  // RED CONTROL = the base's rule (2.369.340): the guard read the FIRST CHARACTER ("/" + a letter) and named the word after it
  const cut = "  const head = String(text == null ? '' : text).trimStart().split(/\\s/, 1)[0].toLowerCase();\n  return AGY_SLASH_COMMANDS.includes(head) ? head : null;\n";
  const BASE_RULE = "  const t = String(text == null ? '' : text).trimStart();\n  return /^\\/[A-Za-z]/.test(t) ? (t.match(/^\\/[\\w:-]+/) || ['/'])[0] : null;\n";
  const mp = path.join(ROOT, 'antigravity-slash-base.js');
  fs.writeFileSync(mp, editAnchor(modSrc, cut, BASE_RULE, "src/harnesses/antigravity-slash.js"));
  const base = require(mp).agySlashCommand;
  ok('RED CONTROL (the base\'s first-character rule): the attachment message IS the command «/home», /tmp/a.txt «/tmp», /notacommand a command',
    gateOf(modSrc.includes(cut)) && base('/home/u/x.zip 这里是…') === '/home' && base('/tmp/a.txt') === '/tmp' && base('/notacommand hello') === '/notacommand' && base('/model') === '/model', [base('/home/u/x.zip 这里是…'), base('/tmp/a.txt'), base('/notacommand hello')]);
}

console.log('— ⑨ NAMED ACCOUNTS: «Add Google account (Antigravity)» = a HOME root each (the real accounts store, a scratch data dir)');
{
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  // a scratch MACHINE HOME (os.homedir() reads HOME): the person's dotfiles, their agy customizations, their own login
  const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data');
  for (const d of ['.ssh', '.gemini/config', '.gemini/antigravity-cli/skills', '.config/gh', '.config/antigravity']) fs.mkdirSync(path.join(MACHINE, d), { recursive: true });
  fs.writeFileSync(path.join(MACHINE, '.ssh/id_ed25519'), 'machine-key\n');
  fs.writeFileSync(path.join(MACHINE, '.gitconfig'), '[user]\n\tname = u\n');
  fs.writeFileSync(path.join(MACHINE, '.config/gh/hosts.yml'), 'gh\n');
  fs.writeFileSync(path.join(MACHINE, '.config/antigravity/plugin-secrets.json'), '{"machine":1}\n');
  fs.writeFileSync(path.join(MACHINE, '.gemini/antigravity-cli/settings.json'), '{"permissions":{"allow":["command(git)"]}}\n');
  fs.writeFileSync(path.join(MACHINE, H8.TOKEN_REL), 'MACHINE-LOGIN');
  fs.mkdirSync(DATA, { recursive: true });
  const prevHome = process.env.HOME; process.env.HOME = MACHINE;
  try {
    const am = new AccountManager({ dataDir: DATA });
    const c = am.createHomeSubscription('antigravity', { name: '' });
    ok('createHomeSubscription: an agy- id whose dir data/agy-subs/<id> is a 0700 HOME root, named by the login label', gateOf(/^agy-[0-9a-f]{12}$/.test(c.id)) && c.dir === path.join(DATA, 'agy-subs', c.id) && (fs.statSync(c.dir).mode & 0o777) === 0o700 && am.get(c.id).name === 'Google' && am.get(c.id).backend === 'antigravity');
    ok('…the login is agy\'s OWN sign-in (its TUI: a link + a pasted code) on that root, the bus disabled, in an empty working dir', c.loginCmd === `cd '${c.dir}/.vibespace-login' && HOME='${c.dir}' DBUS_SESSION_BUS_ADDRESS=disabled: 'agy'`, c.loginCmd);
    const L = (rel) => { try { return fs.readlinkSync(path.join(c.dir, rel)); } catch { return null; } };
    ok('THE FARM: the agent\'s own commands see the person\'s dotfiles (.ssh, .gitconfig, .config/gh, ~/.gemini/config are links)',
      L('.ssh') === path.join(MACHINE, '.ssh') && L('.gitconfig') === path.join(MACHINE, '.gitconfig') && L('.config/gh') === path.join(MACHINE, '.config/gh') && L('.gemini/config') === path.join(MACHINE, '.gemini/config'));
    ok('…agy\'s own state is per account: .gemini/antigravity-cli and .config/antigravity are the root\'s (no machine login, no machine plugin secrets)',
      gateOf(fs.lstatSync(path.join(c.dir, '.gemini/antigravity-cli')).isDirectory()) && !fs.existsSync(path.join(c.dir, H8.TOKEN_REL)) && !fs.existsSync(path.join(c.dir, '.config/antigravity')));
    const acctSettings = path.join(c.dir, '.gemini/antigravity-cli/settings.json');
    ok('…the person\'s agy customizations are linked (skills), settings.json is the ACCOUNT\'S OWN file seeded from the machine\'s',
      L('.gemini/antigravity-cli/skills') === path.join(MACHINE, '.gemini/antigravity-cli/skills') && gateOf(fs.lstatSync(acctSettings).isFile()) && JSON.parse(fs.readFileSync(acctSettings, 'utf8')).permissions.allow[0] === 'command(git)');
    let threw = ''; try { am.resolveForSpawn(c.id, 'antigravity'); } catch (e) { threw = e.message; }
    ok('before the sign-in: listed not logged in, and a spawn on it refuses by name', am.list().accounts.find((a) => a.id === c.id).loggedIn === false && verdictOf(/not logged in/.test(threw)), threw);
    fs.writeFileSync(path.join(c.dir, H8.TOKEN_REL), 'ACCOUNT-LOGIN', { mode: 0o600 }); // what agy's sign-in writes
    const fin = am.finalizeHomeSubscription(c.id);
    ok('finalize: logged in by a stat of agy\'s file (no identity read — the name stays until the person renames it)', fin.loggedIn === true && fin.email === null && am.get(c.id).name === 'Google', fin);
    fs.writeFileSync(path.join(MACHINE, '.npmrc'), 'registry\n'); // the person's HOME gains an entry after the account was made
    const sp = am.resolveForSpawn(c.id, 'antigravity');
    ok('a spawn on it: HOME = the account root + the bus disabled (process env, never argv), no secret, nothing to ship', sp.localEnv.HOME === c.dir && sp.localEnv.DBUS_SESSION_BUS_ADDRESS === 'disabled:' && sp.secret === null && sp.remoteCreds === null && sp.kind === 'antigravity-subscription', sp);
    ok('…and the spawn REFRESHED the farm (the new ~/.npmrc is linked)', L('.npmrc') === path.join(MACHINE, '.npmrc'));
    let rt = ''; try { am.resolveForSpawn(c.id, 'antigravity', { remote: true }); } catch (e) { rt = e.message; }
    ok('a REMOTE spawn on a named account is refused by name (localOnly: the login never leaves this machine)', verdictOf(/run on this machine only/.test(rt)), rt);
    am.setDefault(c.id, 'antigravity');
    ok('the default is the descriptor\'s field (defaultAntigravityAccountId), a no-pick spawn takes it, "subscription" = the machine login', am.list().defaultAntigravityAccountId === c.id && am.resolveForSpawn(undefined, 'antigravity')?.id === c.id && am.resolveForSpawn('subscription', 'antigravity') === null);
    ok('…the claude / codex defaults are untouched', am.list().defaultAccountId === null && am.list().defaultCodexAccountId === null);
    const again = am.homeLoginCommand(c.id);
    ok('"Sign in again" answers the same login command on the existing root', again.id === c.id && again.loginCmd === c.loginCmd);
    const exp = JSON.stringify(am.exportBundle());
    ok('export carries the account record and NOT its login (files: nothing — a secret we never read)', gateOf(exp.includes(c.id)) && !exp.includes('ACCOUNT-LOGIN') && !exp.includes('MACHINE-LOGIN'));
    am.remove(c.id);
    ok('remove: the root goes and NOTHING it linked is touched (rm never follows: the person\'s .ssh key, gh, agy settings, machine login all intact)',
      !fs.existsSync(c.dir) && am.list().defaultAntigravityAccountId === null && fs.readFileSync(path.join(MACHINE, '.ssh/id_ed25519'), 'utf8') === 'machine-key\n'
      && gateOf(fs.existsSync(path.join(MACHINE, '.config/gh/hosts.yml'))) && gateOf(fs.existsSync(path.join(MACHINE, '.gemini/antigravity-cli/skills'))) && fs.readFileSync(path.join(MACHINE, H8.TOKEN_REL), 'utf8') === 'MACHINE-LOGIN');
    const ms = g.creds.machineStatus({ cmd: null });
    fs.rmSync(path.join(MACHINE, H8.TOKEN_REL));
    const ms2 = g.creds.machineStatus({ cmd: '/opt/agy' });
    ok('machineStatus (the Agents row): a stat only — the machine\'s file ⇒ signed in; no file ⇒ UNKNOWN (null: with a session bus agy keeps it in the OS keyring)', ms.installed === false && ms.loggedIn === true && ms2.installed === true && ms2.loggedIn === null, { ms, ms2 });
  } finally { process.env.HOME = prevHome; }
}

console.log('— ⑩ THE /usage READING: the judge (the brief\'s STOP rule) + the capture script (no parser until a signed-in capture)');
{
  const U = require(path.join(REPO, 'src/harnesses/antigravity-usage.js'));
  const measured = U.judgeUsageAnswer({ code: 1, stdout: JSON.stringify(FX.unauthenticated.usageStdout), stderr: FX.unauthenticated.streamPipe.stderr.join('\n') });
  ok('the MEASURED unauthenticated answer (agy 1.4.3 offline) is auth-required — and shows no turn', measured.verdict === 'auth-required' && U.turnSigns(FX.unauthenticated.usageStdout).length === 0, measured);
  const clean = { conversation_id: '', status: 'SUCCESS', response: 'x', num_turns: 0, usage: { input_tokens: 0, output_tokens: 0 } };
  ok('a SUCCESS with no turn in a shape no signed-in capture pinned is "unparsed" — the one pinned shape is the 1.4.3 capture\'s (usage-groups; its parser legs: test-antigravity-usage)', U.KNOWN_SHAPES.length === 1 && U.KNOWN_SHAPES[0].id === 'usage-groups' && U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(clean) }).verdict === 'unparsed');
  const billed = [{ ...clean, num_turns: 1 }, { ...clean, conversation_id: 'c-1' }, { ...clean, usage: { input_tokens: 0, output_tokens: 3 } }, { event: 'result', result: { ...clean, num_turns: 2 } }];
  ok('THE STOP RULE: any sign of a turn — num_turns, a conversation, one token, the stream-json result shape — is turn-started', verdictOf(billed.every((e) => U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(e) }).verdict === 'turn-started')), billed.map((e) => U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(e) }).verdict));
  const src = fs.readFileSync(path.join(REPO, 'src/harnesses/antigravity-usage.js'), 'utf8');
  const cut = '  if (signs.length) return { verdict: \'turn-started\'';
  const mutated = path.join(ROOT, 'antigravity-usage-noturn.js');
  fs.writeFileSync(mutated, editAnchor(editAnchor(src, cut, '  if (false && signs.length) return { verdict: \'turn-started\'', "src/harnesses/antigravity-usage.js"), "require('../quota-model.js')", `require(${JSON.stringify(path.join(REPO, 'src/quota-model.js'))})`, "src/harnesses/antigravity-usage.js")); // the copy lives in scratch: its one relative require made absolute
  ok('RED control: a judge copy without the turn check calls a billed answer "unparsed" (the STOP rule can go red)', gateOf(src.includes(cut)) && require(mutated).judgeUsageAnswer({ code: 0, stdout: JSON.stringify(billed[0]) }).verdict === 'unparsed');
  ok('redactCapture: e-mails, project ids and opaque tokens become placeholders', JSON.stringify(U.redactCapture({ a: 'me@x.com', p: 'proj-name-123456', t: 'x'.repeat(48) })) === '{"a":"<email>","p":"<project>","t":"<opaque>"}');
  // the capture script, against the fake agy
  const CAP = path.join(REPO, 'scripts/agy-usage-capture.mjs');
  const run = (args, env = {}) => new Promise((res) => { const log = path.join(ROOT, `cap-${Math.random().toString(36).slice(2)}.log`); const c = spawn(process.execPath, [CAP, '--agy', STUB, ...args], { env: { ...CLEAN_ENV, AGY_STUB_LOG: log, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => res({ code, out, log: (() => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } })() })); });
  const outOf = (n) => path.join(ROOT, `usage-${n}.json`);
  const a = await run(['--out', outOf('auth')]);
  ok('capture, not signed in: exit 2, nothing written', a.code === 2 && gateOf(/auth-required/.test(a.out)) && !fs.existsSync(outOf('auth')), a.out);
  const o = await run(['--out', outOf('ok')], { AGY_STUB_USAGE: 'ok' });
  const capOk = fs.existsSync(outOf('ok')) ? JSON.parse(fs.readFileSync(outOf('ok'), 'utf8')) : null;
  ok('capture, no turn: exit 0, the redacted answer written (version, argv, verdict unparsed, no e-mail left)', o.code === 0 && gateOf(capOk) && capOk.version === FX.version && capOk.verdict === 'unparsed' && JSON.stringify(capOk.argv) === JSON.stringify(U.USAGE_ARGV) && !/@example\.com/.test(JSON.stringify(capOk)), o.out);
  const tr = await run(['--out', outOf('turn')], { AGY_STUB_USAGE: 'turn' });
  ok('capture, a turn started: exit 3 (STOP) and the evidence written marked turn-started', tr.code === 3 && JSON.parse(fs.readFileSync(outOf('turn'), 'utf8')).verdict === 'turn-started', tr.out);
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const machine = path.join(ROOT, 'cap-machine'); fs.mkdirSync(machine);
  const root = path.join(ROOT, 'cap-acct'); H8.seedHomeRoot(root, machine);
  const ac = await run(['--account', root, '--out', outOf('acct')], { AGY_STUB_USAGE: 'ok' });
  const usageCall = ac.log.find((x) => x.argv && x.argv[0] === '-p');
  ok('--account runs it on the account\'s root: HOME = the root, the bus disabled (the spawn env), the CLI\'s own argv', ac.code === 0 && gateOf(usageCall) && usageCall.home === root && usageCall.bus === 'disabled:' && JSON.stringify(usageCall.argv) === JSON.stringify(U.USAGE_ARGV), { log: ac.log, out: ac.out });
  const bad = await run(['--account', machine, '--out', outOf('bad')]);
  ok('--account on a directory that is not an account root is refused (exit 1), agy never runs', bad.code === 1 && !bad.log.some((x) => x.argv && x.argv[0] === '-p'), bad.out);
}

console.log('— ⑪ THE EXECUTABLE (lane antigravity-spawn-argv): argv[4] is agy itself, anything else is refused BY NAME');
{
  // the owner's 2.369.334 hub handed `/usr/bin/env K=V … agy` here: `env --input-format …` ⇒ exit 125, «see agy-wrapper.log»
  const run = (cmd, wrapper = WRAPPER) => new Promise((res) => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'x-')), log = path.join(dir, 'stub.log');
    const c = spawn(process.execPath, [wrapper, path.join(dir, 's.buf'), path.join(dir, 's.json'), cmd, '--extra'], { env: { ...CLEAN_ENV, AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 8000);
    c.on('exit', (code) => { clearTimeout(t); const recs = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      res({ code, errors: recs.filter((r) => r.kind === 'notice' && r.level === 'error').map((r) => r.text), ran: fs.existsSync(log) }); });
    try { c.stdin.end(); } catch { }
  });
  const unresolved = (c) => `agy-wrapper: the command is not an executable: ${c} — the hub's Antigravity path is unresolved; reinstall agy or set ANTIGRAVITY_CMD`;
  const plain = path.join(ROOT, 'not-executable'); fs.writeFileSync(plain, '#!/bin/sh\n', { mode: 0o644 });
  const cases = [['agy', unresolved('agy')], ['/nope/agy', unresolved('/nope/agy')], [plain, unresolved(plain)], [ROOT, unresolved(ROOT)],
    ['/usr/bin/env', "agy-wrapper: the command is /usr/bin/env, a launcher, not agy — the hub put an env prefix where the executable goes (agy's flags would land in front of it); update VibeSpace"]];
  for (const [cmd, words] of cases) {
    const r = await run(cmd);
    ok(`argv[4] = ${cmd === plain ? '<a file that is not executable>' : cmd === ROOT ? '<a directory>' : cmd}: exit 1, the ONE error line names it, nothing spawned`, r.code === 1 && r.errors.length === 1 && r.errors[0] === words && !r.ran, r);
  }
  // RED copy: the refusal cut ⇒ /usr/bin/env runs and the session says only the exit code (the owner's 125)
  const src = fs.readFileSync(WRAPPER, 'utf8'), cut = "  if (refused) { notice('error', refused, 'spawn-failed'); finalizeExit(1); return; }\n";
  const mutated = path.join(MUTBIN, 'agy-wrapper-no-refusal.js');
  fs.writeFileSync(mutated, editAnchor(src, cut, '', "data/bin/agy-wrapper.js"));
  const m = await run('/usr/bin/env', mutated);
  ok('RED copy (the refusal cut): /usr/bin/env runs and the session says only «exit code 125 — see agy-wrapper.log»', src.split(cut).length === 2 && m.code === 125 && verdictOf(m.errors.some((t) => /exited \(exit code 125\) — see agy-wrapper\.log/.test(t))), m);
}


console.log('— ⓣ THE ONE TABLE (B-7e49, 主开发 r2347): this file and its twin run disjoint halves of one table of legs, whole');
{
  const OWN = fs.readFileSync(path.join(REPO, FILES.fast), 'utf8'), OTHER = fs.readFileSync(path.join(REPO, FILES.heavy), 'utf8');
  for (const [n, c, e] of [...judge('fast', LEG, OWN, OTHER), ...controls('fast', LEG, OWN, OTHER)]) ok(n, verdictOf(c), e);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
