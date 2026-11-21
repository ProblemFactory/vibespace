#!/usr/bin/env node
// measure-claude-rewind-files.mjs — row B-437e, the files tier: what the installed claude CLI states about its `rewind_files`
// control request, READ FROM ITS PROGRAM FILE AS BYTES (never run: no process, no network, no sign-in), written to
// scripts/fixtures/claude-cli/<version>-rewind-files.json — the captured oracle src/rewind-files.js and
// scripts/test-rewind-files.mjs are judged against (the rule tier one's scripts/measure-claude-rewind.mjs keeps: a capture
// with the version it was read from, never a hand copy).
//   node scripts/measure-claude-rewind-files.mjs <the pinned program file, e.g. ~/.local/share/claude/versions/2.1.322> [--out <file>]
// Every fact is found by a PATTERN over the minified bundle; a pattern that finds nothing STOPS the capture by name (a renamed
// field must be re-read by a person, never guessed). Each fact keeps a short excerpt of what it was read from.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.argv[2];
const outArg = process.argv.indexOf('--out');
const usage = () => { console.error('usage: node scripts/measure-claude-rewind-files.mjs <claude program file> [--out <file>]'); process.exit(2); };
if (!bin || !(() => { try { return fs.statSync(bin).isFile(); } catch { return false; } })()) usage();
if (outArg > 0 && !process.argv[outArg + 1]) usage();
const version = path.basename(fs.realpathSync(bin));
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`the program file's name is no version (${version}) — pass the versioned file itself`); process.exit(2); }
const buf = fs.readFileSync(bin);
const s = buf.toString('latin1');
const need = (cond, what) => { if (!cond) { console.error(`NOT FOUND: ${what} — the bundle moved; read it by hand before writing a capture`); process.exit(3); } };
const cut = (i, n = 160) => s.slice(Math.max(0, i), Math.max(0, i) + n).replace(/[^\x20-\x7e]/g, '·');
const esc = (x) => x.replace(/\$/g, '\\$');
// each pattern that names a definition must be UNIQUE in the whole bundle (a minified name recurs across modules)
const only = (re, what) => { const all = [...s.matchAll(new RegExp(re.source, 'g'))]; need(all.length === 1, `${what} — exactly once in the bundle (found ${all.length})`); return all[0]; };

// 1. the handler: the request's two fields, the function it asks, when it answers success and when the control's error
const h0 = s.indexOf('.request.subtype==="rewind_files"');
need(h0 >= 0 && s.indexOf('.request.subtype==="rewind_files"', h0 + 1) < 0, 'the rewind_files handler (once)');
const win = s.slice(h0, h0 + 900);
const call = /\{let ([\w$]+)=[\w$]+\(\),([\w$]+)=await ([\w$]+)\([\w$]+\.request\.user_message_id,\1,[\w$]+\.request\.dry_run\?\?!1\);/.exec(win);
need(call, 'the handler\'s ask: <fn>(request.user_message_id, the app state, request.dry_run ?? false)');
const fields = [...new Set([...win.slice(0, win.indexOf('else if')).matchAll(/\.request\.([a-z_]+)/g)].map((m) => m[1]))].filter((f) => f !== 'subtype').sort();
need(JSON.stringify(fields) === '["dry_run","user_message_id"]', `the request's fields (${fields.join(', ')})`);
const success = new RegExp(`if\\(${esc(call[2])}\\.canRewind\\|\\|[\\w$]+\\.request\\.dry_run\\)`).exec(win);
need(success, 'the success reply when it can rewind or it was a dry run');
const error = new RegExp(`else [\\w$]+\\([\\w$]+,[\\w$]+\\([\\w$]+,${esc(call[2])}\\.error\\?\\?"Unexpected error","Failed to rewind"\\)\\)`).exec(win);
need(error, 'the control\'s error reply for a press that cannot rewind (its words, else «Unexpected error»)');

// 2. the function the handler asks: its two named refusals, the dry run's reply, the failure's words, the press's reply
const fn = only(new RegExp(`async function ${esc(call[3])}\\(e,n,r\\)\\{`), `the function ${call[3]}`);
const body = s.slice(fn.index, fn.index + 900);
const refusals = [...body.matchAll(/return\{canRewind:!1,error:"([^"]+)"\}/g)].map((m) => m[1]);
need(refusals.length === 2, `the two named refusals (${refusals.length})`);
const gate = /if\(!([\w$]+)\(\)\)return\{canRewind:!1,error:"([^"]+)"\}/.exec(body);
need(gate && gate[2] === refusals[0], 'the first refusal: the checkpoints gate');
const noSnap = /if\(![\w$]+\([\w$]+\.fileHistory,e\)\)return\{canRewind:!1,error:"([^"]+)"\}/.exec(body);
need(noSnap && noSnap[1] === refusals[1], 'the second refusal: no checkpoint for the message');
const dry = /if\(r\)\{let ([\w$]+)=await [\w$]+\(n\.fileHistory,e\);return\{canRewind:!0,filesChanged:\1\?\.filesChanged,insertions:\1\?\.insertions,deletions:\1\?\.deletions\}\}/.exec(body);
need(dry, 'the dry run\'s reply {canRewind: true, filesChanged, insertions, deletions}');
const failed = /return\{canRewind:!1,error:`(Failed to rewind: )\$\{/.exec(body);
need(failed, 'the failure\'s words «Failed to rewind: …»');
const press = /return\{canRewind:!0,skippedLinks:[\w$]+\?\.skippedLinks\}/.exec(body);
need(press, 'the press\'s reply {canRewind: true, skippedLinks}');

// 3. the gate: which road reads the switch, which the setting (the probe's checkpoint pair says which one ours is — row
//    B-437e U0); its two early «off» answers named by the functions they ask (their meaning is not read here: said as such)
const g = only(new RegExp(`function ${esc(gate[1])}\\(\\)\\{if\\(([\\w$]+)\\(\\)\\)return!1;if\\(([\\w$]+)\\(\\)\\)return!1;if\\(([\\w$]+)\\(\\)\\)return ([\\w$]+)\\(\\);return [\\w$]+\\("fileCheckpointingEnabled",!0\\)\\.value&&![\\w$]+\\.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING\\}`), `the gate ${gate[1]}`);
const gateOff = [g[1], g[2]], gateRoad = g[3], switchFn = g[4];   // two early «off» answers, the road test, the switch reader
const sw = only(new RegExp(`function ${esc(switchFn)}\\(\\)\\{return [\\w$]+\\.(CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING)&&![\\w$]+\\.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING\\}`), `the switch reader ${switchFn}`);

// 3b. the dry run's list: the function its dry run asks aggregates path STRINGS (it does not say which go back and which are
//     deleted); the press's skippedLinks is a COUNT; the handler's words wrapper gives the fallback only to one session kind
const dryFn = /if\(r\)\{let [\w$]+=await ([\w$]+)\(n\.fileHistory,e\);/.exec(body);
need(dryFn, 'the dry run\'s own function');
const agg = only(new RegExp(`async function ${esc(dryFn[1])}\\(e,n\\)\\{[\\s\\S]{0,1400}?for\\(let ([\\w$]+) of [\\w$]+\\)\\{if\\(!\\1\\)continue;([\\w$]+)\\.push\\(\\1\\.filePath\\),[\\w$]+\\+=\\1\\.stats\\?\\.insertions\\|\\|0,[\\w$]+\\+=\\1\\.stats\\?\\.deletions\\|\\|0\\}return\\{filesChanged:\\2,insertions:[\\w$]+,deletions:[\\w$]+\\}\\}`), `the dry run's aggregate in ${dryFn[1]} (paths pushed, counts summed)`);
const deletes = new RegExp(`async function ${esc(dryFn[1])}\\(e,n\\)\\{[\\s\\S]{0,900}?if\\([\\w$]+===null&&await [\\w$]+\\([\\w$]+\\)\\)return\\{filePath:[\\w$]+,stats:[\\w$]+\\}`).exec(s);
need(deletes, 'a file with no backup that exists now is listed too (it is DELETED by a press) — the same {filePath, stats} as one put back');
const pressFn = only(/async function ([\w$]+)\(e,n\)\{if\(![\w$]+\(\)\)return;let r=e\(\);if\(!r\)return;let s=r\.snapshots\.findLast\(\(w\)=>w\.messageId===n\);/, 'the press\'s own function');
const pressRet = new RegExp(`async function ${esc(pressFn[1])}\\(e,n\\)\\{[\\s\\S]{0,1600}?skippedLinksCount:([\\w$]+)\\}\\),\\{skippedLinks:\\1\\}\\}`).exec(s);
need(pressRet, 'the press\'s reply {skippedLinks: the count it logs as skippedLinksCount}');
const allFailed = /No files were restored: \$\{/.test(s.slice(pressFn.index, pressFn.index + 1600));
need(allFailed, 'the press\'s «No files were restored» when every differing file failed (some failing beside some restored answers success)');
const wrap = /function ([\w$]+)\(e,r,o\)\{return ([\w$]+)\(e\)\?o:r\}/.exec(s.slice(Math.max(0, s.indexOf(`${error[0].match(/,([\w$]+)\(/)[1]}(e,r,o)`) - 20)));
need(wrap, 'the words wrapper (the fallback only for one session kind, the words themselves otherwise)');

// 4. the transcript's own rows of the checkpoints (the hub's reader passes them by: KNOWN_IGNORED_RECORD_TYPES)
const rows = ['file-history-snapshot', 'file-history-delta'].filter((t) => s.includes(`"${t}"`));
need(rows.length === 2, 'the checkpoint rows file-history-snapshot and file-history-delta');
// the snapshot row the CLI appends: {type: "file-history-snapshot", messageId, snapshot, isSnapshotUpdate} — read by pattern
const snapRow = /type:"file-history-snapshot",messageId:[\w$.]+,snapshot:[\w$.]+,isSnapshotUpdate:[\w$.!]+/.exec(s);
need(snapRow, 'the snapshot row\'s writer {type, messageId, snapshot, isSnapshotUpdate}');
const backup = /\{backupFileName:[\w$.]+,version:[\w$.]+,backupTime:new Date,realParentDir:[^}]+\}/.exec(s);
need(backup, 'a backup entry {backupFileName, version, backupTime: a Date, realParentDir}');

const capture = {
  _note: 'MEASURED by scripts/measure-claude-rewind-files.mjs — never edited by hand. Read from the program file as bytes; nothing was run.',
  cli: version, programSha256: crypto.createHash('sha256').update(buf).digest('hex'), programBytes: buf.length,
  how: 'patterns over the minified bundle (each fact keeps its excerpt); the CLI was never started',
  request: { type: 'control_request', subtype: 'rewind_files', fields },
  reply: {
    dryRun: ['canRewind', 'filesChanged', 'insertions', 'deletions'], press: ['canRewind', 'skippedLinks'],
    successWhen: 'canRewind or a dry run', otherwise: 'the control\'s error reply with the words (else «Unexpected error»)',
  },
  words: { 'checkpoints-off': refusals[0], 'no-checkpoint': refusals[1], failedPrefix: failed[1].replace(/: $/, '') },
  gate: { switch: sw[1], disable: 'CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING', setting: 'fileCheckpointingEnabled', settingDefault: true, roads: 'one road reads the switch, the other the setting — which one is ours, the probe\'s checkpoint pair measures (row B-437e U0)' },
  dryRunList: { form: 'paths (strings), once each', deletions: 'listed like the rest — a file with no backup that exists now is DELETED by a press', fn: dryFn[1] },
  pressReply: { skippedLinks: 'a count', allFailed: '«No files were restored: …» (the error reply)', someFailed: 'success — the CLI says nothing of the files that failed' },
  wordsWrapper: { fn: wrap[1], rule: 'the fallback words only where its session test says so; the words themselves otherwise', test: wrap[2] },
  gateDetail: { earlyOff: gateOff, roadTest: gateRoad, switchReader: switchFn, note: 'the early «off» tests and the road test are named, not read — which road ours is, the probe\'s checkpoint pair measures (row B-437e U0)' },
  rows: { types: rows, snapshotRow: [...snapRow[0].matchAll(/([A-Za-z]+):/g)].map((m) => m[1]), backupEntry: [...backup[0].matchAll(/(?:^\{|,)([A-Za-z]+):/g)].map((m) => m[1]) },
  excerpts: { handler: cut(h0, 220), ask: cut(h0 + call.index, 160), fn: cut(fn.index, 260), gate: cut(g.index, 220), switch: cut(sw.index, 160), dryAggregate: cut(agg.index, 200), press: cut(pressFn.index, 200), wrapper: cut(s.indexOf(wrap[0]), 80), snapshotRow: cut(snapRow.index, 120), backupEntry: cut(backup.index, 100) },
};
const out = outArg > 0 ? process.argv[outArg + 1] : path.join(REPO, 'scripts', 'fixtures', 'claude-cli', `${version}-rewind-files.json`);
fs.writeFileSync(out, JSON.stringify(capture, null, 1) + '\n');
console.log(`${out}: ${version}, the request ${fields.join(' + ')}, the words «${refusals[0]}» / «${refusals[1]}» / «${capture.words.failedPrefix}: …», the switch ${sw[1]}`);
