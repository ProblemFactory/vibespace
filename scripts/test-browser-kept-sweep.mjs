#!/usr/bin/env node
// THE SWEEP'S FAIL-CLOSED LAW (lane bl-windows, 主开发 r3006 — for 2.369.416): a kept browsers' store whose read FAILED at a start is
// never «empty» to the boot sweep. The release SET the unreadable data/browser-kept.json ASIDE: the file became «not there», browser-env's
// own read (keptKeySet) answered an EMPTY set, and the boot sweep removed — recursively — every kept browser's profile folder, its
// sign-ins. ONE leg, the refusal PLACED (the store's first read at the start refused, EIO — never a real mount, never a mode change): the
// real kept store loads, the REAL boot sweep (browser-env's sweep) runs over stand-in profile folders — ZERO removed — and a kept browser
// noted after it writes nothing over the file. RED: the release's load (the rename) — the folders gone.
// In-process, scratch folders only; no browser, no daemon.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('kept-sweep');
const { ok, report } = checker();
const KB = require(path.join(REPO, 'src/browser-kept.js'));
const BE = require(path.join(REPO, 'src/server/browser-env.js'));
const KS0 = require(path.join(REPO, 'src/server/browser-kept.js'));
const KSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-kept.js'), 'utf8');
const MUT = mutantCopies('kept-sweep', REPO);
const quiet = { log() { }, warn() { }, error() { } };
const KEYS = ['bk-0000a011', 'bk-0000b012'];   // two kept browsers, each with its profile folder (its sign-ins)
const stoppedKeeper = () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, list: () => ({ profiles: [] }) });

let wn = 0;
async function scene(KS) {
  const dir = path.join(ROOT, `w${++wn}`), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true });
  const be = BE.create({ dataDir: dir, homeDir: home, serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock') });
  const file = path.resolve(path.join(dir, KB.KEPT_FILE));
  const bytes = JSON.stringify({ version: 1, entries: Object.fromEntries(KEYS.map((k) => [k, { hasDir: true, tabs: [{ url: 'https://mail.example/' }] }])) });
  fs.writeFileSync(file, bytes);
  for (const k of KEYS) { fs.mkdirSync(be.scratchDirFor(k), { recursive: true }); fs.writeFileSync(path.join(be.scratchDirFor(k), 'Cookies'), 'a sign-in'); }
  // PLACED: the store's first read at the start is refused (a share that answers EIO once) — the sweep's own read later is not
  const realRead = fs.readFileSync;
  let refused = 0;
  fs.readFileSync = function (p, ...a) { if (!refused && path.resolve(String(p)) === file) { refused++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  let S;
  try { S = KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), log: quiet, sweepEveryMs: 0, thereEveryMs: 0 }); S.has(KEYS[0]); }   // the start's load
  finally { fs.readFileSync = realRead; }
  const sw = be.sweep(new Set(), { graceMs: 0 });   // THE REAL BOOT SWEEP
  const left = KEYS.filter((k) => fs.existsSync(path.join(be.scratchDirFor(k), 'Cookies'))).length;
  S.noteStart('bk-0000c013', { hasDir: true });   // a kept browser noted after it: the store writes (or not)
  return { refused, removed: KEYS.length - left, same: fs.existsSync(file) && realRead(file, 'utf8') === bytes, swept: sw.swept, keptDirs: sw.keptDirs };
}

console.log('① a read refused at a start: the REAL boot sweep removes NO kept browser\'s folder, and nothing is written over the file');
const g = await scene(KS0);
console.log(`    facts: ${JSON.stringify(g)}`);
ok(g.refused === 1 && g.removed === 0 && g.keptDirs === KEYS.length && g.same, 'the store\'s first read is refused (EIO): the file stays where it is, the boot sweep reads it itself and spares BOTH kept browsers\' profile folders (zero removed), and a kept browser noted after it writes nothing over the file', g);
const x = await scene(MUT.load('src/server/browser-kept.js', anchored(KSRC, '        keptUnread = String((e && (e.code || e.name)) || \'unreadable\');\n', '        const aside = `${file}.corrupt-${now()}`;\n        try { fs.renameSync(file, aside); log.warn?.(`[browser-kept] ${file} could not be read (${e.message}) — set aside as ${path.basename(aside)}; starting from an empty store (no directory is removed for it)`); }\n        catch (e2) { log.warn?.(`[browser-kept] ${file} could not be read (${e.message}) and could not be set aside (${e2.message})`); }\n', 'the release\'s load: the rename aside'), 'kept-sweep-release'));
console.log(`    facts (red): ${JSON.stringify(x)}`);
ok(x.removed === KEYS.length && !x.same, 'RED CONTROL (the release\'s load: an unreadable store is renamed aside): the file is «not there» to the boot sweep, which REMOVES both kept browsers\' profile folders — their sign-ins — and the next write replaces the file — red', x);

report();
