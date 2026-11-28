#!/usr/bin/env node
// lane browser-stderr-pipe (userW inc-mv2qf3xs-7g87, 2026-10-10): A CHILD'S OUTPUT ALWAYS HAS A READER OR NO PIPE. The driver
// 0.38.1 spawned Chrome with a stderr pipe it never read (measured: 64 KB later Chrome blocks, DevTools answers 0 bytes); the
// pin is 0.38.2 (it drains it). Defence in depth, gated here:
//   ① the quiet switches (argv census + a planted --enable-logging RED)   ② the stdio rule over our spawns of the driver
//   (src/server/browser-*.js + browser-facts; a planted unread pipe RED) + the rule in miniature (a 200 KB writer ends with a
//   reader, blocks on an unread pipe)   ③ the stderr-pipe-full verdict (PURE + controls)   ④ the pin + the keeper wiring + the words
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const BE = require('../src/browser-stderr.js');
const BS = require('../src/browser-stuck.js');
const VERBS = require('../src/browser-verbs.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = scratch('bsp'); fs.mkdirSync(S, { recursive: true });

// ═══ ① THE QUIET SWITCHES ═══
console.log('— ① the quiet switches (withQuietLogging)');
ok(BE.withQuietLogging('--no-sandbox,--disable-blink-features=AutomationControlled') === '--no-sandbox,--disable-blink-features=AutomationControlled,--disable-logging,--log-level=3', 'a string gains --disable-logging,--log-level=3 (its separator kept)');
ok(JSON.stringify(BE.withQuietLogging(['--no-sandbox'])) === JSON.stringify(['--no-sandbox', '--disable-logging', '--log-level=3']), 'a list stays a list');
ok(BE.withQuietLogging('') === '--disable-logging,--log-level=3' && BE.withQuietLogging(undefined) === '--disable-logging,--log-level=3', 'nothing ⇒ the switches alone');
ok(BE.withQuietLogging('--a\n--b') === '--a\n--b\n--disable-logging\n--log-level=3', 'a newline list stays newline-separated');
for (const theirs of ['--enable-logging=stderr', '--v=1', '--log-level=0', '--vmodule=*=2']) ok(BE.withQuietLogging(`--no-sandbox,${theirs}`) === `--no-sandbox,${theirs}`, `the user's own ${theirs} wins (untouched — the automationFlag precedent)`);
// THE CENSUS: no launch switch VibeSpace composes turns Chrome's logging ON — a source literal "--enable-logging" lives only in the module that names the rule
const ENABLE_RE = /['"`][^'"`\n]*--enable-logging/;
// r1563 (B-7e49 slice 1, lane bl-tests-e): THE TREE ONCE A RUN — the enable census and ③'s launch roads each read every src file
// from disk; now one memo of this suite's own (absolute path → text). The planted control's scratch file is read once, fresh.
const TEXTS = new Map();
const textOf = (f) => { let t = TEXTS.get(f); if (t === undefined) TEXTS.set(f, t = fs.readFileSync(f, 'utf8')); return t; };
function enableCensus(files) { return files.filter((f) => ENABLE_RE.test(textOf(f).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n'))).map((f) => path.relative(ROOT, f)); }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const srcFiles = walk(path.join(ROOT, 'src')).filter((f) => !/\/lib\/i18n-|\/vendor\//.test(f));
const hits = enableCensus(srcFiles);
ok(hits.length === 0, `no src literal spells --enable-logging (${srcFiles.length} files)`, hits);
const planted = path.join(S, 'planted-args.js'); fs.writeFileSync(planted, "const ARGS = '--no-sandbox,--enable-logging=stderr';\n");
ok(enableCensus([planted]).length === 1, 'CONTROL: a planted args literal with --enable-logging=stderr is RED');

// ═══ ② THE STDIO RULE ═══
console.log('— ② the stdio rule (no unread pipe in our spawns of the driver)');
/** Every `spawn(` in a source text: its argument text (to the matching paren) and whether the child's output pipes have a reader.
 *  A spawn with no `stdio` option PIPES all three; `'pipe'` / `'overlapped'` in its stdio pipes that slot. A reader = the
 *  child's `.stdout`/`.stderr` consumed (`.on('data'` / `.pipe(` / `.resume(` / `.setEncoding(` + on) in the same file. */
function stdioCensus(src) {
  const text = String(src).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n'); // code only: a comment's "spawn (" is prose
  const out = [];
  const re = /\bspawn\(/g; let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index + m[0].length - 1, end = -1;
    for (; i < text.length; i++) { const c = text[i]; if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) { end = i; break; } } }
    const call = text.slice(m.index, end + 1);
    const st = /stdio\s*:\s*(\[[^\]]*\]|'[a-z]+'|"[a-z]+")/.exec(call);
    const piped = !st ? true : /'pipe'|"pipe"|'overlapped'/.test(st[1]) && !/^\[\s*['"](?:ignore|inherit)['"]\s*,\s*['"](?:ignore|inherit)['"]\s*,\s*['"](?:ignore|inherit)['"]/.test(st[1]);
    const outPiped = !st ? true : (st[1].startsWith('[') ? st[1].split(',').slice(1, 3).some((x) => /pipe|overlapped/.test(x)) : /pipe/.test(st[1]));
    const read = /\.(stdout|stderr)\s*(\?\.)?\s*\.?(on\s*\(\s*['"]data['"]|pipe\s*\(|resume\s*\()/.test(text);
    if (piped && outPiped && !read) out.push(call.slice(0, 160));
  }
  return out;
}
const ours = fs.readdirSync(path.join(ROOT, 'src/server')).filter((n) => /^browser-.*\.js$/.test(n)).map((n) => path.join(ROOT, 'src/server', n)).concat([path.join(ROOT, 'src/browser-stderr.js'), path.join(ROOT, 'src/browser-facts.js')]);
const unread = ours.flatMap((f) => stdioCensus(textOf(f)).map((c) => `${path.relative(ROOT, f)}: ${c}`));
ok(unread.length === 0, `every spawn in ${ours.length} files (src/server/browser-*.js, browser-facts.js, browser-stderr.js) has a reader or no pipe`, unread);
const spawnCount = ours.reduce((n, f) => n + (textOf(f).match(/\bspawn\(/g) || []).length, 0);
ok(spawnCount >= 2, `the census sees the spawns it judges (${spawnCount} ≥ 2: browser-cli-install + browser-installs, both a file fd)`);
ok(stdioCensus("const c = spawn('the-driver', ['open'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });\nc.unref();").length === 1, 'CONTROL: a planted spawn with stdio pipes and no reader is RED');
ok(stdioCensus("const c = spawn('the-driver', ['open']);").length === 1, 'CONTROL: a planted spawn with NO stdio option (three pipes) and no reader is RED');
ok(stdioCensus("const c = spawn('x', [], { stdio: ['ignore', 'pipe', 'pipe'] });\nc.stdout.on('data', f); c.stderr.on('data', f);").length === 0, 'a spawn whose pipes are read passes');
ok(stdioCensus("const c = spawn('x', [], { stdio: ['ignore', fd, fd] });").length === 0, 'a spawn into a file fd passes');
const noisy = path.join(S, 'noisy.sh');
fs.writeFileSync(noisy, '#!/bin/sh\ni=0\nwhile [ $i -lt 2000 ]; do echo "[1:1:1010/000000.000000:ERROR:noisy.cc(1)] a log line of about a hundred bytes ........................." >&2; i=$((i+1)); done\n'); fs.chmodSync(noisy, 0o755);
const runNoisy = (read) => new Promise((resolve) => { const c = spawn(noisy, [], { stdio: ['ignore', 'ignore', 'pipe'] }); let n = 0, done = false; if (read) c.stderr.on('data', (d) => { n += d.length; }); c.on('exit', (code) => { done = true; resolve({ done: true, code, n, c }); }); setTimeout(() => { if (!done) resolve({ done: false, n, c }); }, 3000); });
const withReader = await runNoisy(true);
ok(gateOf(withReader.done) && withReader.code === 0 && withReader.n > 150000, `the rule in miniature: a child writing ~200 KB to a stderr pipe WITH a reader ends (${withReader.n} bytes read — what 0.38.2's drain thread does)`);
const unreadPipe = await runNoisy(false);
ok(!unreadPipe.done, 'CONTROL: the SAME child on an UNREAD stderr pipe is still blocked after 3 s (64 KB, then every write waits — 0.38.1\'s Chrome in miniature)');
try { unreadPipe.c.kill('SIGKILL'); } catch { }

// ═══ ③ THE VERDICT ═══
console.log('— ③ the stderr-pipe-full verdict (PURE)');
const full = { fd2: 'pipe:[351497172]', wchans: ['anon_pipe_write', 'anon_pipe_write'], answered: false };
ok(BE.stderrPipeVerdict(full) === 'stderr-pipe-full', 'fd 2 a pipe + the main thread in pipe_write at both samples + no answer ⇒ stderr-pipe-full (the measured base fixture)');
ok(BE.stderrPipeVerdict({ ...full, wchans: ['pipe_write', 'pipe_write'] }) === 'stderr-pipe-full', 'an older kernel\'s pipe_write spelling too');
ok(BE.stderrPipeVerdict({ ...full, wchans: ['anon_pipe_write', 'poll_schedule_timeout.constprop.0'] }) === null, 'CONTROL: a READER drained it between the samples (the writer woke) ⇒ not that verdict');
ok(BE.stderrPipeVerdict({ ...full, fd2: '/data/browser-logs/bp-1.log' }) === null, 'CONTROL: fd 2 a file ⇒ not that verdict');
ok(BE.stderrPipeVerdict({ ...full, answered: true }) === null, 'CONTROL: it answered ⇒ null');
ok(BE.stderrPipeVerdict({ ...full, wchans: ['anon_pipe_write'] }) === null && BE.stderrPipeVerdict({}) === null, 'one sample / no facts ⇒ null');
const fake = { readlinkSync: (p) => (p === '/proc/77/fd/2' ? 'pipe:[9]' : (() => { throw new Error('ENOENT'); })()), readFileSync: (p) => (p === '/proc/77/wchan' ? 'anon_pipe_write' : (() => { throw new Error('ENOENT'); })()) };
const pf = await BE.probeStderrPipe(77, { fsImpl: fake, sleep: async () => { } });
ok(pf.fd2 === 'pipe:[9]' && pf.wchans.length === 2 && BE.stderrPipeVerdict(pf) === 'stderr-pipe-full', 'the /proc probe reads fd 2 + two wchan samples', pf);
ok(BE.stderrPipeVerdict(await BE.probeStderrPipe(process.pid, { gapMs: 10 })) === null, 'this process (fd 2 not a full pipe) ⇒ null on the real /proc');
ok(verdictOf(/stderr-pipe-full — Chrome pid 77 is blocked writing its log into pipe:\[9\] that nothing reads \(its daemon runs the browser driver 0\.38\.1; 0\.38\.2 drains it\) — Restart runs it on 0\.38\.2/.test(BE.stderrPipeLine({ id: 'bp-1', label: 'w', pid: 77, fd2: 'pipe:[9]' }))), 'the journal line names the pid, the pipe and the cause');

// ═══ ④ THE PIN + THE KEEPER WIRING + THE WORDS ═══
console.log('— ④ the pin, the keeper wiring, the panel\'s words');
const cmpV = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
ok(BE.FIXED_IN === '0.38.2' && cmpV(VERBS.AGENT_BROWSER_CLI.table, BE.FIXED_IN) >= 0, `the pinned driver (${VERBS.AGENT_BROWSER_CLI.table}) is at least the version that drains Chrome's stderr (${BE.FIXED_IN})`);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok(gateOf(JSON.stringify(pkg).includes(`agent-browser@${VERBS.AGENT_BROWSER_CLI.table}`)) && verdictOf(fs.readFileSync(path.join(ROOT, 'deploy/docker/Dockerfile'), 'utf8').includes(`agent-browser@${VERBS.AGENT_BROWSER_CLI.table}`)), 'package.json\'s install line and the Dockerfile name the same pin');
const KS = textOf(path.join(ROOT, 'src/server/browser-keeper.js'));
// B-1789 cure (主开发 11:12Z — «THE SWITCHES LIVE WHERE EVERY LAUNCH ROAD PASSES, AND A CENSUS DERIVES THE ROADS»): a LAUNCH ROAD is
// any src code that marks a launch (withKeeperMark / keeperMarkArg — every VibeSpace launch carries its mark, lane H verify r4),
// quiets one (withQuietLogging) or composes one (launchTail / generatedConfig / generatedConfigParts) — found HERE by what it
// calls, never listed by hand. The law:
//   (a) withKeeperMark( and withQuietLogging( are called only inside THE LAUNCH TAIL (src/browser-profiles.js launchTail);
//   (b) keeperMarkArg( only inside withKeeperMark, inside a sentence (a `${…}` of words), or on the argv road — its statement
//       carries QUIET_LOG_ARGS (attachArgv: Chrome started without the driver, a whole argv under its own census);
//   (c) a composer call that turns the switches OFF names the record's STAMP (quietLog / quietLogFor(…)), never a bare value.
const TAIL_CALLS = /\b(withKeeperMark|withQuietLogging|keeperMarkArg|launchTail|generatedConfig(?:Parts)?)\(/g;
const TAIL_ANY = /\b(?:withKeeperMark|withQuietLogging|keeperMarkArg|launchTail|generatedConfig(?:Parts)?)\(/;
const bodyOf = (text, name) => { const i = text.indexOf(`\nfunction ${name}(`); const j = i < 0 ? -1 : text.indexOf('\n}\n', i); return j < 0 ? null : [i, j]; };
function launchRoads(files) {
  const roads = [], bad = [];
  for (const { rel, text } of files) {
    if (!TAIL_ANY.test(text)) continue; // a file that calls none of them is no road (one linear scan — src is ~36 MB)
    const own = rel === 'src/browser-profiles.js' ? { tail: bodyOf(text, 'launchTail'), mark: bodyOf(text, 'withKeeperMark') } : {};
    if (rel === 'src/browser-profiles.js' && !own.tail) bad.push({ where: rel, call: 'launchTail', why: 'THE LAUNCH TAIL is not in the composer\'s module (function launchTail)' });
    const inside = (span, pos) => !!span && pos > span[0] && pos < span[1];
    let off = 0;
    for (const [n, raw] of text.split('\n').entries()) {
      const at0 = off; off += raw.length + 1;
      if (/^\s*(\/\/|\*|\/\*)/.test(raw)) continue;
      const cut = raw.indexOf(' // '), code = cut >= 0 ? raw.slice(0, cut) : raw;
      for (const m of code.matchAll(TAIL_CALLS)) {
        const name = m[1], pos = at0 + m.index, before = code.slice(0, m.index), road = { where: `${rel}:${n + 1}`, call: name };
        if (/\bfunction\s+$/.test(before)) continue; // its own definition
        if (name === 'withKeeperMark' || name === 'withQuietLogging') { if (inside(own.tail, pos)) roads.push(road); else bad.push({ ...road, why: 'marks or quiets a launch outside THE LAUNCH TAIL' }); continue; }
        if (name === 'keeperMarkArg') {
          if (inside(own.mark, pos) || /\$\{(?:[A-Za-z_$][\w$]*\.)?$/.test(before)) continue; // withKeeperMark's own / words naming the mark
          if (/QUIET_LOG_ARGS/.test(code)) roads.push({ ...road, call: 'argv road (keeperMarkArg + QUIET_LOG_ARGS)' });
          else bad.push({ ...road, why: 'a hand-made mark: a launch road that skips THE LAUNCH TAIL' });
          continue;
        }
        roads.push(road);
        const q = /\bquiet(?:Log)?:\s*([^,})]+)/.exec(code.slice(m.index));
        if (q && !/^(quietLog\b|quietLogFor\()/.test(q[1].trim())) bad.push({ ...road, why: `turns the switches off without the record's stamp (${q[1].trim()})` });
      }
    }
  }
  return { roads, bad };
}
const srcTexts = srcFiles.map((f) => ({ rel: path.relative(ROOT, f), text: textOf(f) }));
const LR = launchRoads(srcTexts);
const roadFiles = [...new Set(LR.roads.map((r) => r.where.split(':')[0]))].sort();
ok(LR.bad.length === 0 && LR.roads.length >= 10 && gateOf(['src/browser-profiles.js', 'src/server/browser-env.js', 'src/server/browser-keeper.js'].every((f) => roadFiles.includes(f))) && verdictOf(LR.roads.some((r) => /^argv road/.test(r.call))),
  `B-1789 cure, THE CENSUS OF LAUNCH ROADS (derived from ${srcTexts.length} src files: ${LR.roads.length} roads in ${roadFiles.join(', ')}): every one passes THE LAUNCH TAIL — the mark and the switches are composed in launchTail alone, the argv road carries QUIET_LOG_ARGS, a switch turned off names its stamp`, LR.bad.length ? LR.bad : LR.roads.map((r) => `${r.where} ${r.call}`));
// its RED controls: three planted roads (a new src file), each named by file:line
const plant = (code) => launchRoads([{ rel: 'src/server/browser-planted.js', text: `'use strict';\n${code}\n` }]).bad; // judged as a file beside the real ones (a road's verdict reads its own file only)
ok(plant("  cfg.args = B.withKeeperMark(cfg.args, key);").length === 1, 'CONTROL: a planted road that marks its launch by withKeeperMark (no switches) is named — RED');
ok(plant("  const argv = [dir, B.keeperMarkArg(id), url];").length === 1, 'CONTROL: a planted argv with a hand-made mark and no QUIET_LOG_ARGS is named — RED');
ok(plant("  cfg.args = B.launchTail(cfg.args, key, { quiet: false });").length === 1 && plant("  log.warn(`it carries ${B.keeperMarkArg(id)}`); cfg.args = B.launchTail(cfg.args, key, { quiet: quietLogFor(kind, key) });").length === 0,
  'CONTROL: a planted road that turns the switches off without its stamp is named — RED (a sentence naming the mark and a stamped opt-out are not)');
{ const BP = textOf(path.join(ROOT, 'src/browser-profiles.js')); const i = BP.indexOf('\nfunction launchTail(');
  ok(verdictOf(launchRoads([{ rel: 'src/browser-profiles.js', text: i < 0 ? BP : BP.slice(0, i) + '\nfunction launchTailRenamed(' + BP.slice(i + '\nfunction launchTail('.length) }]).bad.some((b) => /not in the composer/.test(b.why))), 'CONTROL: the composer\'s tail gone (renamed) ⇒ the census fails BY NAME, never vacuously green'); }
// THE TAIL itself (PURE): the switches, then the mark — last
const BP0 = require('../src/browser-profiles.js');
ok(BP0.launchTail('--no-sandbox', 'bk-0000beef') === '--no-sandbox,--disable-logging,--log-level=3,--vibespace-keeper=bk-0000beef' && JSON.stringify(BP0.launchTail(['--a'], 'bk-1')) === JSON.stringify(['--a', '--disable-logging', '--log-level=3', '--vibespace-keeper=bk-1'])
  && BP0.launchTail('--v=1,--vibespace-keeper=bk-evil', 'bk-1') === '--v=1,--vibespace-keeper=bk-1' && BP0.launchTail('--a', 'bk-1', { quiet: false }) === '--a,--vibespace-keeper=bk-1' && BP0.launchTail('--a', null) === '--a,--disable-logging,--log-level=3',
  'launchTail: the switches then the mark (a list stays a list); a user\'s own logging switch wins and a forged mark is replaced; quiet:false (a stamp) = the mark alone; no mark = the switches alone');
ok(gateOf(/const quietLog = !p\.host && !!prow\.starts && !argvPrefix\.length;/.test(KS)) && gateOf(/\n\s*quietLog \}; \/\/ lane browser-stderr-pipe/.test(KS)) && gateOf(/\n\s*rec\.quietLog = true;\n/.test(KS)) && verdictOf(/\n\s*if \(prev && prev\.quietLog\) rec\.quietLog = true;/.test(KS)),
  'the stamps: a profile launch that starts a Chrome here (not a host, not a cloud -p provider) is stamped quietLog; an ephemeral\'s fresh launch is stamped (B-1789 cure) and an ADOPTED one carries its previous record\'s stamp (a server restart keeps the view it launched with); the keeper\'s files read the stamp (the census, rule c)');
ok(gateOf(/hangCause\(rec, p, pid, fact\.since\); \}/.test(KS)) && verdictOf(/if \(was && was\.since === fact\.since && was\.cause\) fact\.cause = was\.cause;/.test(KS)), 'the hung verdict asks /proc for the cause once per run; the cause rides later asks');
const fullK = 'The browser froze because its log pipe filled and nothing read it (a fault of the browser driver 0.38.1, fixed in 0.38.2) — Restart starts it again on the updated driver; logins stay in the profile, its tabs are re-opened and every conversation using it is told';
const uw = BS.unresponsiveWords({ since: Date.UTC(2026, 9, 10, 18, 32), label: 'jarvis-work', clock: '18:32', cause: 'stderr-pipe-full' });
ok(uw.tooltip === fullK && uw.state === 'Not answering since 18:32', 'the panel row\'s words name the log pipe (state word unchanged)', uw);
ok(verdictOf(/hung, not busy/.test(BS.unresponsiveWords({ since: 1, clock: '00:00' }).tooltip)), 'no cause ⇒ the words as before');
for (const lang of ['zh', 'ja']) { const tr = fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8'); ok(verdictOf(tr.includes(JSON.stringify(fullK) + ':')), `the ${lang} catalogue carries the new words`); }
ok(verdictOf(/cause: r\.unresponsive\.cause \|\| null/.test(textOf(path.join(ROOT, 'src/lib/browser-trace-view.js')))), 'the Browser panel\'s row passes the keeper\'s cause to the words');

fs.rmSync(S, { recursive: true, force: true });
console.log(`\n${fail ? '✗' : '✓'} test-browser-stderr-pipe: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
