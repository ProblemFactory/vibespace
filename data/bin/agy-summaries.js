#!/usr/bin/env node
'use strict';
// THE ANTIGRAVITY INDEX, READ IN ITS OWN PROCESS (lane dead-socket-keeps-chat-meta): `node agy-summaries.js <home>…` prints
// {"<home>": [{id, title, at, cwd}] | null} — each account root's conversation_summaries.db (agy's own index: a title and
// the last write per conversation, never a transcript), opened read-only at the path the store gate answers (the token law:
// src/agy-store-fs.js). The hub's antigravity discover (src/agy-discover.js) runs it as a child: a db is never opened on the
// hub's thread (test-architecture §73) — the wrapper's rule (data/bin/agy-wrapper.js storeDbRows).
const path = require('path');
const { storeReader } = require(path.join(__dirname, '..', '..', 'src', 'agy-store-fs.js'));
const AS = require(path.join(__dirname, '..', '..', 'src', 'agy-store.js'));

let sqlite = null;
const emit = process.emitWarning; // node:sqlite announces itself as experimental once — noise on a child's stderr
process.emitWarning = function (w, ...rest) { if (/SQLite is an experimental feature/.test(String((w && w.message) || w))) return; return emit.call(this, w, ...rest); };
try { sqlite = require('node:sqlite'); } catch { sqlite = null; } finally { process.emitWarning = emit; }

const out = {};
for (const home of process.argv.slice(2)) {
  out[home] = null;
  const abs = sqlite && storeReader(home).path(AS.SUMMARIES, 'index');
  if (!abs) continue;
  let db = null;
  try { db = new sqlite.DatabaseSync(abs, { readOnly: true }); out[home] = db.prepare(AS.SUMMARY_SQL).all().map(AS.summaryRowOf).filter(Boolean); }
  catch (e) { process.stderr.write(`agy-summaries: ${home}: ${e.message}\n`); }
  finally { try { db?.close(); } catch { } }
}
process.stdout.write(JSON.stringify(out));
