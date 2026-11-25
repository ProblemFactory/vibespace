'use strict';
// B-574d on the 2.369.418 train (主开发 r4048): A KILL PLACED IN THE RELOGIN's RESOLVE. A child of scripts/test-accounts-store-writer.mjs
// (section H1): argv = <accounts module path> <dataDir> <stand-in worker path> <row id>. The resolve runs to its «ask» with the
// verdict as the ONLY stand-in (the facts could not prove whose sign-in it is) and this press's helper success; at the move into the
// hold — between the question's save and the move — this process is KILLED (SIGKILL: no exit flush, nothing of it lands after).
// The parent then starts FRESH over the same data and reads whether the row asks. Nothing else of the store is replaced.
const path = require('path');
const [modPath, dataDir, workerPath, id] = process.argv.slice(2);
const REPO = path.join(__dirname, '..', '..');
console.log = () => { }; console.warn = () => { };
const SW = require(path.join(REPO, 'src', 'store-writer.js'));
const AI = require(path.join(REPO, 'src', 'account-identity.js'));
const { AccountManager } = require(modPath);
const W = SW.create({ log: { log() { }, warn() { }, error() { } }, workerPath, durableMs: 1500 });
const am = new AccountManager({ dataDir, storeWriter: W });
am._lookAgain = () => ({ loggedIn: true });
am._reloginBefore = new Map([[id, { at: Date.now(), attempt: 'k-1', record: null, word: 'Member' }]]);
am._loginStatusRaw = () => ({ state: 'success', attempt: 'k-1' });
AI.beforeAfterVerdict = () => 'ask';
am._moveLogin = () => { process.kill(process.pid, 'SIGKILL'); return 0; };
let r = null;
try { r = am.reloginResolve(id); } catch (e) { r = { threw: (e && e.code) || String(e) }; }
process.stdout.write('NOT KILLED ' + JSON.stringify(r) + '\n');
process.exit(3);
