#!/usr/bin/env node
// lane machine-card-fold (2026-10-04; the owner's phone: "这个spam比较厉害 可以进行一下折叠 连续的同一个机器上的指令可以折叠起来").
// FAST, in-process, PURE tables + patched-copy controls:
//   ① src/encoded-command.js — a PowerShell -EncodedCommand decoded for display: valid, the abbreviations, pwsh, invalid
//     base64, odd length, huge (bounded), hidden characters inside the decoded script, lines it must NOT decode
//   ② the words and the door — exit-reach cardText / askDetailOf / runRow (agent) / refusalText, and the REAL
//     ExitProxyManager.run door refusing an encoded script the belt refuses (and one it cannot show)
//   ③ the fold — chat-run-summary machineCardOf / messageKind / foldToggleFor / splitRuns / machineRunPart / runSummaryLabel:
//     same machine consecutive = one run, another machine breaks it, a failure surfaces, a live member says "still running"
//   ③b lane machine-card-compact: machineLineOf (ONE line per call — verb + command + outcome, a failure's first error line,
//     never the machine) and THE compact rule (machineCompact: ≥ 2 Machines cards in the run)
//   ④ the wiring census (chat-view's fold pass, the renderer, the Commands list, the ask) + ⑤ controls (patched copies)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500) : '')); } };
const MUT = mutantCopies('machine-card-fold', REPO);
const EC = require(path.join(REPO, 'src/encoded-command.js'));
const E = require(path.join(REPO, 'src/exit-reach.js'));
const RS = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-run-summary.js')).href);
const enc = (s) => Buffer.from(s, 'utf16le').toString('base64');
const SCRIPT = 'Write-Output "hi"\r\nGet-ChildItem E:\\house3d\\jobs | Select-Object -First 3';
const B = enc(SCRIPT);
const ENC = `powershell -NoProfile -NonInteractive -EncodedCommand ${B}`;
const RLO = String.fromCharCode(0x202e), ZWSP = String.fromCharCode(0x200b), CR = String.fromCharCode(13);

// ── ① the decode table ──
console.log('① src/encoded-command.js — the decode table');
const DECODE = (M) => {
  const D = (c) => M.encodedCommandOf(c);
  const rows = [
    ['the owner\'s shape (-NoProfile -NonInteractive -EncodedCommand)', D(ENC), (r) => r && r.ok && r.script === SCRIPT && r.head === 'Write-Output "hi"' && r.exe === 'powershell' && !r.hidden.length && r.shown === SCRIPT.replace(/\r\n/g, '\n')],
    ['-e', D(`powershell -e ${B}`), (r) => r && r.ok && r.flag === '-e'],
    ['-enc', D(`powershell.exe -enc ${B}`), (r) => r && r.ok && r.flag === '-enc'],
    ['-ec', D(`powershell -ec ${B}`), (r) => r && r.ok],
    ['/EncodedCommand and --encodedcommand', [D(`powershell /EncodedCommand ${B}`), D(`pwsh --encodedcommand ${B}`)], (r) => r.every((x) => x && x.ok)],
    ['pwsh, pwsh.exe, a quoted path with a space', [D(`pwsh -enc ${B}`), D(`pwsh.exe -e ${B}`), D(`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoP -W Hidden -ExecutionPolicy Bypass -ec ${B}`)], (r) => r.every((x) => x && x.ok && x.exe === 'pwsh')],
    ['invalid base64 (a character outside the alphabet)', D(`powershell -enc ${B.slice(0, -4)}_AAA`), (r) => r && !r.ok && r.code === 'invalid_base64'],
    ['invalid base64 (not a multiple of 4)', D(`powershell -enc ${B}A`), (r) => r && !r.ok && r.code === 'invalid_base64'],
    ['odd length (3 bytes: not UTF-16LE)', D(`powershell -enc ${Buffer.from('abc').toString('base64')}`), (r) => r && !r.ok && r.code === 'odd_length'],
    ['huge (> 64 KiB decoded) refused by name before a byte is decoded', D(`powershell -enc ${enc('x'.repeat(33 * 1024))}`), (r) => r && !r.ok && r.code === 'too_big'],
    ['a lone surrogate', D(`powershell -enc ${Buffer.from([0x3d, 0xd8, 0x41, 0x00]).toString('base64')}`), (r) => r && !r.ok && r.code === 'bad_utf16'],
    ['a direction control inside the decoded script is found (and spelled in the head)', D(`powershell -enc ${enc(`echo a${RLO}b`)}`), (r) => r && r.ok && r.hidden.includes('U+202E') && r.head.includes('⟦U+202E⟧') && !r.head.includes(RLO)],
    ['a zero-width space inside the decoded script is found', D(`pwsh -e ${enc(`Remove-Item a${ZWSP}b`)}`), (r) => r && r.ok && r.hidden.includes('U+200B')],
    ['a LONE CR (CSS draws a space, PowerShell ends a line) is hidden; CRLF is not', [D(`powershell -enc ${enc(`# note${CR}Remove-Item x`)}`), D(ENC)], ([a, b]) => a && a.ok && a.hidden.includes('U+000D') && b.hidden.length === 0],
    ['NOT decoded (shown raw): -Command, a shell operator, two encoded flags, an unknown flag, cmd /c, a plain command', [D('powershell -Command Get-Date'), D(`powershell -enc ${B} & del x`), D(`powershell -enc ${B} | iex`), D(`powershell -e ${B} -enc ${B}`), D(`powershell -Foo -enc ${B}`), D(`cmd /c powershell -enc ${B}`), D('ls -la'), D('')], (r) => r.every((x) => x === null)],
    // verify r1 V1: the interpreter word is read by the SHELL before PowerShell sees a flag — a path carrying an operator, a
    // variable or a substitution ran more than the shown script (cmd.exe: `C:\x&calc&\powershell.exe`); a powershell.exe in
    // any other folder (or a POSIX path, C:\usr\bin on Windows) is not provably PowerShell — all shown raw
    ['NOT decoded (verify r1 V1): an interpreter word the shell reads first, or one outside the install folders', [D(`C:\\x&calc.exe&\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -EncodedCommand ${B}`), D(`C:\\x|calc|\\powershell.exe -enc ${B}`), D(`%TEMP%\\powershell.exe -enc ${B}`), D(`"%TEMP%\\powershell.exe" -enc ${B}`), D(`id>/tmp/x;/usr/bin/pwsh -ec ${B}`), D(`"$(touch /tmp/p)/usr/bin/pwsh" -ec ${B}`), D('`id`/usr/bin/pwsh -ec ' + B), D(`id>/tmp/x\n/usr/bin/pwsh -ec ${B}`), D(`C:\\Users\\me\\Downloads\\powershell.exe -enc ${B}`), D(`/usr/bin/pwsh -enc ${B}`)], (r) => r.every((x) => x === null)],
    ['the install folders (verify r1 V1): System32 bare path, no .exe, any case', [D(`C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -enc ${B}`), D(`C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\powershell -e ${B}`), D(`"C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe" -enc ${B}`)], (r) => r.every((x) => x && x.ok && x.exe === 'powershell')],
    ['NOT decoded (verify r1 V1): the prefix the interpreter does not read as a flag (-- under powershell, / under pwsh)', [D(`powershell --enc ${B}`), D(`pwsh /enc ${B}`), D(`pwsh.exe /EncodedCommand ${B}`)], (r) => r.every((x) => x === null)],
  ];
  return rows.map(([name, got, judge]) => ({ name, good: !!judge(got), got }));
};
for (const r of DECODE(EC)) ok(r.good, r.name, r.got);
{
  const big = `powershell -enc ${'A'.repeat(1024 * 1024)}`;
  const t0 = process.hrtime.bigint(); const r = EC.encodedCommandOf(big); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(r && r.code === 'too_big' && ms < 50, `a 1 MiB line is refused too_big without a decode (${ms.toFixed(1)} ms < 50)`, r);
  ok(EC.commandHeadOf(ENC) === 'PowerShell: Write-Output "hi"' && EC.commandHeadOf('ls -la') === 'ls -la', 'commandHeadOf: "PowerShell: <first line>", a plain command as itself');
}

// ── ② the words and the door ──
console.log('② exit-reach words + the ExitProxyManager.run door');
ok(/^ran `PowerShell: Write-Output "hi"` on WIN-DESK1 — exit 0 · 1\.4 s$/.test(E.cardText({ outcome: 'ran', cmd: ENC, code: 0, ms: 1400 }, { machine: 'WIN-DESK1' })), 'the card\'s head reads "ran `PowerShell: <first line>` on <machine>"', E.cardText({ outcome: 'ran', cmd: ENC, code: 0, ms: 1400 }, { machine: 'WIN-DESK1' }));
{
  const d = E.askDetailOf(ENC);
  ok(d.startsWith('PowerShell script (decoded from -EncodedCommand):\nWrite-Output "hi"\nGet-ChildItem') && d.endsWith(`The line that runs:\n${ENC}`) && E.askDetailOf('  ls -la ') === 'ls -la', 'the ask\'s detail: the decoded script first, then the line that runs; a plain command = itself trimmed (unchanged)', d.slice(0, 200));
  const line = { verb: 'run', cmd: ENC, code: 0, ms: 5, at: 1 };
  ok(E.runRow(line, { agent: true }).cmd.startsWith('PowerShell: Write-Output "hi" Get-ChildItem') && E.runRow(line).cmd === ENC, '`vibespace-exit runs` (the agent row) shows the decoded script; the owner row keeps the line (the list decodes it)');
  ok(/not base64/.test(E.refusalText('bad_command', { encoded: EC.encodedCommandOf(`powershell -enc ${B}A`) })) && /^the decoded -EncodedCommand script carries/.test(E.refusalText('bad_command', { hidden: ['U+202E'], encoded: { ok: true } })), 'the refusal names what is wrong (cannot be shown / the decoded script carries hidden characters)');
}
const door = async (file) => {
  const { ExitProxyManager } = require(file);
  const xp = new ExitProxyManager({ hosts: { list: () => [], get: () => null }, log: () => {} });
  const tryRun = async (cmd) => { try { await xp.run(null, 'sid', 'WIN-DESK1', cmd); return 'passed the door'; } catch (e) { return `${e.code}:${e.encoded || ''}:${(e.hidden || []).join(',')}`; } };
  return { hid: await tryRun(`powershell -enc ${enc(`echo a${RLO}b`)}`), odd: await tryRun(`powershell -enc ${Buffer.from('abc').toString('base64')}`), good: await tryRun(ENC), plainHid: await tryRun(`echo a${RLO}b`) };
};
const D0 = await door(path.join(REPO, 'src/exit-proxy.js'));
ok(D0.hid === 'bad_command:hidden:U+202E', 'the door: an encoded script carrying U+202E is refused bad_command exactly like a plain command', D0);
ok(D0.plainHid.startsWith('bad_command::U+202E'), 'the door: the plain command is refused as before', D0);
ok(D0.odd === 'bad_command:odd_length:', 'the door: an encoded command whose script cannot be shown never runs unread', D0);
ok(!D0.good.startsWith('bad_command'), 'the door: a clean encoded command passes the belt (then the grant judges it)', D0);

// ── ③ the fold ──
console.log('③ chat-run-summary — the Machines kind, the split, the head');
const T0 = Date.UTC(2026, 9, 4, 11, 39);
const card = (machine, text, extra = {}) => ({ role: 'user', originKind: 'peer-message', peerVia: 'notification', peerFrom: `Machines · ${machine}`, content: [{ type: 'text', text }], ts: T0, ...extra });
const ran = (m, code = 0, min = 0) => card(m, `ran \`PowerShell: x\` on ${m} — exit ${code} · 1.4 s`, { exitRun: { code, ms: 1400 }, ts: T0 + min * 60000 });
const pulled = (m, min = 0) => card(m, `pulled \`E:\\a.png\` from ${m} → \`/tmp/a.png\` — 1.2 MB · sha256 abc… verified · 0.4 s`, { ts: T0 + min * 60000 });
const FOLD = (R) => {
  const kindOf = (m) => (m.hidden ? 'skip' : m.role === 'assistant' && m.text ? null : (() => { const k = R.messageKind(m, { toolCard: !!m.tool }); return k && ['bash', 'read'].includes(R.foldToggleFor(k)) ? 'noise' : null; })());
  const machineOf = (m) => R.machineCardOf(m)?.machine || null;
  const split = (ms) => R.splitRuns(ms, kindOf, machineOf).map((r) => r.length);
  const bash = { role: 'assistant', tool: true, content: [{ type: 'tool_use', toolName: 'Bash' }] };
  const text = { role: 'assistant', text: true, content: [{ type: 'text', text: 'ok' }] };
  const six = [ran('M'), ran('M', 0, 1), pulled('M', 1), ran('M', 0, 2), pulled('M', 2), ran('M', 0, 3)];
  const tm = (ts) => new Date(ts).toISOString().slice(11, 16);
  const part = (cards, running = false) => R.machineRunPart({ cards: cards.map(R.machineCardOf), running, time: tm }, (k, p) => k.replace(/\{(\w+)\}/g, (_, x) => p[x]));
  const failedRun = card('M', 'ran `x` on M — exit 2 · 0.1 s', { exitRun: { code: 2 } });
  return [
    ['a Machines card is the \'machine\' kind, rides the Bash toggle', R.messageKind(ran('M'), { toolCard: false }) === 'machine' && R.foldToggleFor('machine') === 'bash' && R.RUN_KINDS.includes('machine') && R.SUMMARY_ORDER.some(([k]) => k === 'machine')],
    ['not a Machines card: a peer\'s own path, a group message, another sender', [card('M', 'ran x', { peerVia: 'peer' }), card('M', 'ran x', { peerGroup: { id: 'g1' } }), { ...ran('M'), peerFrom: 'Background Work · x' }].every((m) => R.machineCardOf(m) === null)],
    ['outcomes: exit 0 ok · exit 2 failed · timed out · copy ok · copy refused · run refused · could not start', [[ran('M'), 'ok', false], [failedRun, 'exit', true], [card('M', 'ran `x` on M — timed out after 30 s', { exitRun: { code: null, timedOut: true } }), 'timed_out', true], [pulled('M'), 'ok', false], [card('M', 'did not pull `a` from M — you denied it'), 'failed', true], [card('M', 'did not run `x` on M — you denied it'), 'failed', true], [card('M', 'could not start `x` on M — no sh'), 'failed', true]].every(([m, o, f]) => { const c = R.machineCardOf(m); return c && c.outcome === o && c.failed === f; })],
    ['same machine consecutive: six cards = ONE run', JSON.stringify(split(six)) === '[6]'],
    ['another machine breaks the run: M M N N = two runs', JSON.stringify(split([ran('M'), ran('M'), ran('N'), ran('N')])) === '[2,2]'],
    ['tool cards of the same turn in between join (the house rule): Bash M Bash M = one run', JSON.stringify(split([bash, ran('M'), bash, ran('M')])) === '[4]'],
    ['assistant text breaks it; a hidden card is transparent', JSON.stringify(split([ran('M'), text, ran('M')])) === '[1,1]' && JSON.stringify(split([ran('M'), { hidden: true }, ran('M')])) === '[2]'],
    ['M Bash N = [M Bash] [N]', JSON.stringify(split([ran('M'), bash, ran('N')])) === '[2,1]'],
    ['the head: machine · short counts · last outcome; the time span its own field', part(six)?.text === 'M · 4 commands · 2 files · last: exit 0' && part(six).time === '11:39–11:42' && part(six).failed === 0],
    ['a failure surfaces in the head (count + the last outcome)', (() => { const p = part([ran('M'), failedRun]); return p.failed === 1 && p.text === 'M · 2 commands · 1 failed · last: exit 2' && p.time === '11:39'; })()],
    ['a live member: the head says "still running" (and the label adds no second running…)', part(six, true).text.includes('still running') && !R.runSummaryLabel({ byKind: R.countKinds(['bash']), running: true, machinePart: 'M · still running' }, (k, p) => k.replace('{n}', p?.n)).includes('running…')],
    ['the machine part LEADS the label', R.runSummaryLabel({ byKind: R.countKinds(['bash', 'machine']), machinePart: 'M · 1 commands run' }, (k, p) => k.replace('{n}', p?.n)) === 'M · 1 commands run · 1 Bash'],
    ['the time span CLOSES the label (after the kinds and the files)', R.runSummaryLabel({ byKind: R.countKinds(['bash', 'machine']), machinePart: 'M · 1 commands', machineTime: '11:39–11:42', files: ['a.txt'] }, (k, p) => k.replace('{n}', p?.n)) === 'M · 1 commands · 1 Bash — a.txt · 11:39–11:42'],
  ];
};
for (const [n, good] of FOLD(RS)) ok(good, n);

// ── ③b the compact line (lane machine-card-compact — the owner: "如果整体已经显示了是win-desk1 每个指令没必要都展示吧") ──
console.log('③b chat-run-summary machineLineOf / machineCompact — ONE line per call inside its machine\'s group');
const MM = 'WIN-DESK1';
const LINE = (R) => {
  const mcd = (text, extra = {}) => card(MM, text, extra);
  const runCard = (rec, h = {}) => mcd(E.cardText(rec, { machine: MM }), rec.outcome === 'ran' ? { exitRun: E.cardOutput({ cmd: rec.cmd, code: rec.code ?? null, ms: rec.ms || 0, timedOut: !!rec.timedOut, heads: E.outputHeads({ stdout: h.stdout || '', stderr: h.stderr || '' }) }) } : {});
  const xfer = (rec) => mcd(E.transferCardText(rec, { machine: MM }));
  const L = (m) => R.machineLineOf(m);
  const encRun = L(runCard({ outcome: 'ran', cmd: ENC, code: 0, ms: 1400 }, { stdout: 'hi' }));
  const plain = L(runCard({ outcome: 'ran', cmd: 'hostname', code: 0, ms: 200 }, { stdout: MM }));
  const bad = L(runCard({ outcome: 'ran', cmd: 'del E:\\house3d\\locked.tmp', code: 1, ms: 300 }, { stderr: '\n  Remove-Item : Access to the path is denied.\n  + CategoryInfo : PermissionDenied', stdout: 'partial' }));
  const outOnly = L(runCard({ outcome: 'ran', cmd: 'type x', code: 2, ms: 100 }, { stdout: 'The system cannot find the file specified.' }));
  const slow = L(runCard({ outcome: 'ran', cmd: 'sleep 99', code: null, ms: 30000, timedOut: true }));
  const denied = L(runCard({ outcome: 'denied', cmd: 'shutdown /r' }));
  const lost = L(runCard({ outcome: 'run_failed', cmd: 'build.cmd' }));
  const pull = L(xfer({ verb: 'pull', outcome: 'done', remote: 'E:\\house3d\\jobs\\h3d-1\\out.png', local: '/var/tmp/mart/h3d-1/out.png', bytes: 1258291, sha256: 'a'.repeat(64), verified: 'sha256', ms: 420 }));
  const push = L(xfer({ verb: 'push', outcome: 'done', remote: 'E:\\in\\a.txt', local: '/tmp/a.txt', bytes: 12, sha256: 'b'.repeat(64), verified: 'sha256', ms: 90 }));
  const nopull = L(xfer({ verb: 'pull', outcome: 'denied', remote: 'E:\\secret.txt', local: '/tmp/s.txt' }));
  const long = L(runCard({ outcome: 'ran', cmd: 'Get-ChildItem ' + 'E:\\very\\long\\path\\'.repeat(12), code: 0, ms: 100 }));
  const multi = L(runCard({ outcome: 'ran', cmd: 'echo a\necho b', code: 0, ms: 100 }));
  const all = [encRun, plain, bad, outOnly, slow, denied, lost, pull, push, nopull, long, multi];
  const lone = [R.machineCardOf(ran('M')), null, null], pair = [R.machineCardOf(ran('M')), null, R.machineCardOf(pulled('M'))];
  return [
    ['an encoded run: "PowerShell: <first line>" · "exit 0 · 1.4 s", no error line', encRun?.what === 'PowerShell: Write-Output "hi"' && encRun.outcome === 'exit 0 · 1.4 s' && !encRun.failed && encRun.error === '' && encRun.text === 'PowerShell: Write-Output "hi" · exit 0 · 1.4 s', encRun],
    ['a plain run: the command as itself · its exit', plain?.what === 'hostname' && plain.outcome === 'exit 0 · 0.2 s' && !plain.failed, plain],
    ['a failed run: "exit 1 · 0.3 s", failed, its FIRST error line (stderr first, blank lines skipped)', bad?.outcome === 'exit 1 · 0.3 s' && bad.failed && bad.error === 'Remove-Item : Access to the path is denied.', bad],
    ['a failed run with only stdout: that first line is the error line', outOnly?.failed && outOnly.error === 'The system cannot find the file specified.', outOnly],
    ['a timeout: "timed out after N s", failed', slow?.failed && /^timed out after \d+ s$/.test(slow.outcome) && slow.what === 'sleep 99', slow],
    ['a refusal / a lost link: the command, then what stopped it', denied?.what === 'shutdown /r' && denied.outcome === 'did not run — you denied it' && denied.failed && lost?.outcome === 'could not finish — the link was lost while it ran' && lost.failed, [denied, lost]],
    ['a pull: "pulled <there> → <here>" · size · time (the hash check stays in the detail)', pull?.what === 'pulled E:\\house3d\\jobs\\h3d-1\\out.png → /var/tmp/mart/h3d-1/out.png' && pull.outcome === '1.2 MiB · 0.4 s' && !pull.failed, pull],
    ['a push: "pushed <here> → <there>"', push?.what === 'pushed /tmp/a.txt → E:\\in\\a.txt' && push.outcome === '12 bytes · 0.1 s', push],
    ['a refused copy: "did not pull <there>" · why, failed', nopull?.what === 'did not pull E:\\secret.txt' && nopull.outcome === 'you denied it' && nopull.failed, nopull],
    ['no line names the machine (the head does) and every line is ONE line', all.every((l) => l && !l.text.includes(MM) && !/\n/.test(l.text + l.error)), all.map((l) => l && l.text)],
    ['a long command is the card\'s head (cut at 80 with "…"); the rest of the cut is CSS, the whole line text stays on the line', long?.what.length === 80 && long.what.endsWith('…') && long.text === `${long.what} · exit 0 · 0.1 s`, long],
    ['not a Machines card: no line', R.machineLineOf(card('M', 'ran x', { peerVia: 'peer' })) === null && R.machineLineOf({ role: 'user', content: [] }) === null],
    ['THE compact rule: ≥ 2 Machines cards in the run ⇒ one line each; a lone card (Bash beside it) stays whole', R.machineCompact(pair) === true && R.machineCompact(lone) === false && R.machineCompact([]) === false, [R.machineCompact(pair), R.machineCompact(lone)]],
  ];
};
for (const [n, good, d] of LINE(RS)) ok(good, n, good ? undefined : d);

// ── ④ the wiring census ──
console.log('④ the wiring (chat-view fold pass, renderer, Commands list, ask, words)');
const CV = read('src/lib/chat-view.js'), CR_ = read('src/lib/chat-renderers.js'), DLG = read('src/lib/exit-runs-dialog.js'), XP = read('src/exit-proxy.js');
const W = {
  split: CV.includes("for (const r of splitRuns(kids, kindOf, (el) => machineCardOf(el._rawMsg)?.machine || null)) { run = r; runKind = 'noise'; flush(); }"),
  failVisible: CV.includes("members.forEach((el, i) => { const mc = machineCards[i]; if (mc && mc.failed) inline.add(el); else if (mc) inline.delete(el); });"),
  alert: CV.includes("if (machinePart && machinePart.failed) header.classList.add('chat-run-alert');"),
  label: CV.includes("machinePart: machinePart ? machinePart.text : '',"),
  card: CR_.includes("if (!raw) { const enc = encodedCommandOf(cmd); if (enc) return encodedCmdBlock(cmd, enc); }"),
  list: DLG.includes("const flat = (enc && enc.ok ? `PowerShell: ${enc.head}` : cmd).replace(/\\n/g, ' ');"),
  ask: XP.includes('text, detail: E.askDetailOf(cmd),') && XP.includes("String(it.detail || '') === E.askDetailOf(k.cmd)"),
};
ok(Object.values(W).every(Boolean), 'the fold pass splits by machine via splitRuns, keeps failures on screen, alerts the head; the card, the list and the ask decode', W);
{ // lane machine-card-compact: the pass decides compact per run (THE rule) and re-decides every pass; the head's time is its own span;
  // the card's line is the toggle of its detail, through the per-message fold state, and never carries a hover title
  const CSS = read('public/chat.css');
  const ml = /\n  _machineLine\(el, msg, ml\) \{[\s\S]*?\n  \}\n/.exec(CR_)?.[0] || '';
  const C = {
    rule: CV.includes('const compact = machineCompact(machineCards);') && CV.includes("members.forEach((el, i) => { if (machineCards[i]) el.classList.toggle('chat-machine-compact', compact); });"),
    reset: CV.includes("list.querySelectorAll(':scope > .chat-machine-compact').forEach((el) => el.classList.remove('chat-machine-compact'));") && CV.includes("'chat-run-last', 'chat-machine-compact']"),
    time: CV.includes('<span class="chat-run-time">· ${escHtml(headTime)}</span>') && CV.includes('run.headTime ? run.mkLabel({ now, live, time: false }) : label'),
    line: CR_.includes('if (ml) this._machineLine(el, msg, ml);') && ml.includes('this._peerFold?.set?.(msg.id, open, el)') && ml.includes("e.key === 'Enter'") && !/\.title\b|'title'/.test(ml),
    css: CSS.includes('.chat-machine-compact:not(.chat-mline-open) > :not(.chat-mline):not(.chat-mline-err) { display: none; }') && CSS.includes('.chat-run-header .chat-run-time { flex: none; white-space: nowrap; }'),
    list: CSS.includes('.chat-msg.chat-vs-notice.chat-machine-compact.chat-run-member + .chat-machine-compact.chat-run-member { margin-top: calc(-1 * var(--chat-list-gap, 12px));') && CSS.includes(':has(+ .chat-machine-compact.chat-run-member) { border-bottom-width: 0;'), // r2: ONE framed list
  };
  ok(Object.values(C).every(Boolean), 'compact: THE rule in the pass (reset every pass, carried on a replaced node), the head\'s time span, the line toggles via the fold state, no hover title, an open group = ONE framed list', C);
}
const words = Object.values(RS.MACHINE_WORDS).concat(['PowerShell script (decoded from {flag})', 'PowerShell -EncodedCommand, not decoded: {why}', 'Show full command', 'Hide full command', 'The script carries characters that change the order it reads in or are not drawn at all: {codes}']);
for (const lang of ['zh', 'ja']) { const dict = read(`src/lib/i18n-${lang}.js`); const miss = words.filter((w) => !dict.includes(JSON.stringify(w) + ':') && !dict.includes(`'${w}':`)); ok(!miss.length, `every new word has its ${lang} entry`, miss); }

// ── ⑤ controls ──
console.log('⑤ controls (patched copies)');
const ECSRC = read('src/encoded-command.js');
const ecControl = (tag, from, to, why, want) => {
  if (!ECSRC.includes(from)) { ok(false, `CONTROL ${tag}: the anchor is gone`, from); return; }
  const f = MUT.write('src/encoded-command.js', ECSRC.replace(from, to), tag);
  const bad = DECODE(require(f)).filter((r) => !r.good).map((r) => r.name);
  ok(bad.some((n) => n.startsWith(want)), `CONTROL ${tag}: ${why} — ① goes red`, bad);
};
ecControl('no-hidden', "const hidden = HC.hiddenCharsOf(shown, { max: 64 });", 'const hidden = [];', 'the decoded script never passes the belt', 'a direction control');
ecControl('no-odd', "  if (nBytes % 2) return refuse('odd_length');\n", '', 'odd length decoded anyway', 'odd length');
ecControl('no-bound', "  if (nBytes > ENCODED_MAX_BYTES) return refuse('too_big');\n", '', 'no 64 KiB bound', 'huge');
ecControl('loose-shape', "    return null;\n  }\n  if (b64 === null) return null;", "    continue;\n  }\n  if (b64 === null) return null;", 'an unknown flag is skipped (the line is decoded though more runs)', 'NOT decoded');
ecControl('any-path', "return EXES.has(w) || WIN_PATHS.has(w.replace(/\\.exe$/, '')) ? w.split('\\\\').pop() : null;", "const x = w.split(/[\\\\/]/).pop(); return EXES.has(x) ? x : null;", 'the interpreter = the last word of any path (verify r1 V1: the shell reads the rest first)', 'NOT decoded (verify r1 V1): an interpreter word');
ecControl('any-prefix', "if (!m || (m[1] === '--' && !pwsh) || (m[1] === '/' && pwsh)) return null;", 'if (!m) return null;', 'every prefix under every interpreter (verify r1 V1)', 'NOT decoded (verify r1 V1): the prefix');
ecControl('crlf-only', "const shown = script.replace(/\\r\\n/g, '\\n');", "const shown = script.replace(/\\r/g, '\\n');", 'a lone CR read as a line end', 'a LONE CR');
const RSSRC = read('src/lib/chat-run-summary.js');
const rsControl = async (tag, from, to, why, want) => {
  if (!RSSRC.includes(from)) { ok(false, `CONTROL ${tag}: the anchor is gone`, from); return; }
  const f = MUT.write('src/lib/chat-run-summary.js', RSSRC.replace(from, to), tag, { esm: true });
  const mod = await import(pathToFileURL(f).href);
  const bad = [...FOLD(mod), ...LINE(mod)].filter(([, g]) => !g).map(([n]) => n);
  ok(bad.some((n) => n.startsWith(want)), `CONTROL ${tag}: ${why} — ③ goes red`, bad);
};
await rsControl('no-machine-split', 'if (k && k === runKind && !(m && runMachine && m !== runMachine))', 'if (k && k === runKind)', 'another machine joins the run', 'another machine breaks the run');
await rsControl('failure-hidden', "failed: outcome !== 'ok'", 'failed: false', 'a failed card counts as fine', 'outcomes');
await rsControl('line-names-machine', "  for (const w of [' on ', ' from ', ' to ']) if (rest.startsWith(w + mc.machine)) { rest = rest.slice(w.length + mc.machine.length); break; }\n", '', 'the line repeats the machine the head names', 'no line names the machine');
await rsControl('no-error-line', 'const error = mc.failed && x ?', 'const error = false && x ?', 'a failed call loses its first error line', 'a failed run');
await rsControl('compact-lone', '(cards || []).filter(Boolean).length >= 2', '(cards || []).filter(Boolean).length >= 1', 'a lone Machines card turns compact', 'THE compact rule');
await rsControl('peer-kind', "  if (machineCardOf(m)) return 'machine';", '', 'Machines cards stay the default-off peer kind (nothing folds)', 'a Machines card is');
const XPSRC = read('src/exit-proxy.js');
{
  const from = "    if (encoded && encoded.hidden.length) throw";
  const f = MUT.write('src/exit-proxy.js', XPSRC.replace(from, '    if (false) throw'), 'door-no-hidden');
  const D1 = await door(f);
  ok(XPSRC.includes(from) && !D1.hid.startsWith('bad_command'), 'CONTROL door-no-hidden: without the encoded belt the U+202E script passes the door — ② goes red', D1);
}

console.log(`\n${fail ? `✗ ${fail} FAILED` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
