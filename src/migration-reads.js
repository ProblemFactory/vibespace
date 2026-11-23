'use strict';
/**
 * MG1 (row B-f276, 主开发 r2929 / r2944): A MIGRATION WHOSE INPUT COULD NOT BE READ HAS NOT RUN.
 *
 * Only «the file is not there» (ENOENT, or ENOTDIR) means nothing to do. Any other failed read (EIO, EACCES, ESTALE, a share that times out)
 * and bytes that are there and do not parse THROW `migration-input-unread`: the runner records nothing (src/migration-runner.js —
 * a throw is a failed run, said in For you and as a notice) and the next start tries again.
 *  - The migrations' OWN reads (src/server/migrations.js) and the helper modules only they call read through readText / readJson /
 *    list / lstat / stat below: strict always.
 *  - A helper module shared with other callers (src/reading-repair.js — the boot's and the hourly identity repair read through it
 *    too; src/slot-transitions.js) and the helper modules only the registry calls (quota-model-migrate, fixture-ledger-purge,
 *    usage-origin-backfill, weekly-lanes-unfold, ledger-slot-backfill, codex-fork-ledger-purge) say a failed read through
 *    `absentOr(e, what)` in their own catch: that throws only while a migration's run() is on the stack (`during`: the registry
 *    wraps every run, src/server/migrations.js), and every other caller (a suite's direct call included) keeps the helper's answer.
 * `during` covers the SYNCHRONOUS part of a run: a stepped migration's later steps read through the strict readers themselves.
 */
const fs = require('fs');
const path = require('path');

const CODE = 'migration-input-unread';
// «not there»: ENOENT, and ENOTDIR (a path whose folder is a file — the same answer)
const absent = (e) => !!(e && (e.code === 'ENOENT' || e.code === 'ENOTDIR'));
let depth = 0;

/** fn() with the shared helpers' reads strict (a migration's run) */
function during(fn) { depth++; try { return fn(); } finally { depth--; } }
const inMigration = () => depth > 0;
const nameOf = (p) => { const s = String(p || ''); return path.basename(s) || s; };
function unread(what, e) {
  const why = e instanceof SyntaxError ? 'its bytes do not parse' : ((e && e.code) || 'an error');
  return Object.assign(new Error(`${what} is there and could not be read (${why}) — not run: the next start tries again`), { code: CODE });
}
/** in a shared helper's catch of a READ: «not there» and every caller outside a migration keep the helper's answer */
function absentOr(e, what) {
  if (e && e.code === CODE) throw e;   // an inner read's refusal, carried as it is (never wrapped twice)
  if (absent(e) || !inMigration()) return;
  throw unread(nameOf(what), e);
}
const orNone = (fn, what) => { try { return fn(); } catch (e) { if (absent(e)) return null; throw unread(nameOf(what), e); } };
/** the text, or null when the file is not there */
const readText = (file, what = file) => orNone(() => fs.readFileSync(file, 'utf-8'), what);
/** the parsed JSON, or null when the file is not there; bytes there that do not parse throw */
function readJson(file, what = file) {
  const t = readText(file, what);
  if (t === null) return null;
  try { return JSON.parse(t); } catch (e) { throw unread(nameOf(what), e); }
}
/** a folder's names, or null when it is not there */
const list = (dir, what = dir, opts) => orNone(() => (opts ? fs.readdirSync(dir, opts) : fs.readdirSync(dir)), what);
const lstat = (file, what = file) => orNone(() => fs.lstatSync(file), what);
const stat = (file, what = file) => orNone(() => fs.statSync(file), what);
/** existsSync answers false for ANY stat error: this one says false only for «not there» */
const exists = (file, what = file) => lstat(file, what) !== null;

module.exports = { CODE, during, inMigration, unread, absentOr, readText, readJson, list, lstat, stat, exists };
