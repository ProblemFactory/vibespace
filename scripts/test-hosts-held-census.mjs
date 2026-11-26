#!/usr/bin/env node
// test-hosts-held-census — THE HELD MACHINES LIST, every reader a row (lane bl-jobs, the remainder of B-f276 cure, 主开发 23:20Z).
// While hosts.json cannot be read the store is HELD (src/hosts.js `_unread`): its list is EMPTY because it is unread, not because a
// machine is gone. Ten readers took that empty list for «removed» (a pick wiped, a Deny rewritten, a token swept, a «pair it again»,
// «not running» …). The law: a lookup while held answers ONE reply — «unknown, by name» (get / findByDeviceId throw `hosts-unread`
// 503; list carries `held`; the machines route answers `unread`) — and EVERY caller is a row here:
//   waits     — it asks again or waits for the read (whenRead / onReadAgain / a retry) before it judges an absence
//   refuses   — it refuses by name (the hold's words or `hosts-unread` reach the person, or the error rides out unchanged)
//   harmless  — an absence there changes nothing that lasts (`why` says what it does instead)
//   not-hosts — the name is another object's (a Map called hosts …; `why` names it)
// A caller with no row is RED; a row whose count moved is RED (a new caller: classify it, then move the count); a row naming no
// live caller is DEAD (red); a BARE catch (a catch that swallows: an empty block or a plain return) on the caller's line or the two
// after it is RED unless its row says why (`bare`). The client half: every page reader of GET /api/hosts is a row the same way,
// and its row's PIN (the line that reads the hold's mark) must stand. FAST, in-process: source text + three driven scenes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';
import * as acorn from 'acorn';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 2b (主开发 r3790): the machines list's hold is the FAMILY HELPER's — `_unread` is its getter. A stand-in made from the prototype
// carries the hold the store now asks (r3792: a stand-in gains what the hub asks of it): held, its words the store's own
const heldBy = (H, code = 'EACCES') => { const f = { file: 'hosts.json', code, since: 1 }; H._hold = { held: () => f, words: () => H._heldWords(f), writable: () => false, refuse: (what) => { throw H._heldError(what); } }; return H; };
const { ok, report } = checker();
const MJ = mutantCopies('hosts-held-census', ROOT);

// ── the census engine (one function: the controls run it over planted copies of the tree's text) ─────────────────────────────────
const COMMENT = /^\s*(\/\/|\*|\/\*)/;
// a catch that SWALLOWS: an empty block, a return of a constant, continue / break, or a constant assigned (on the lookup's line, or a
// `catch` opening the next line)
const BARE = /catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*(?:(?:return\s*(?:null|false|true|undefined|0|''|""|\[\]|\{\}|'[^'{}]*')?|continue|break|\w+\s*=\s*(?:null|false|\[\]|''))\s*;?\s*)?\}/;
// its read S4: a lookup inside a MULTI-LINE try is judged by that try's catch — the innermost try whose block holds it (acorn), so a
// `try { … hosts.get(…) … } catch { }` forty lines on is seen; a file acorn cannot parse is red (never skipped)
const swallows = (h) => {
  const b = (h && h.body && h.body.body) || [];
  if (!b.length) return true;
  if (b.length > 1) return false;
  const st = b[0], a = st.argument;
  if (st.type === 'ContinueStatement' || st.type === 'BreakStatement') return true;
  if (st.type === 'ReturnStatement') return !a || a.type === 'Literal' || (a.type === 'Identifier' && a.name === 'undefined') || (a.type === 'ArrayExpression' && !a.elements.length) || (a.type === 'ObjectExpression' && !a.properties.length);
  return st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' && (st.expression.right.type === 'Literal' || (st.expression.right.type === 'ArrayExpression' && !st.expression.right.elements.length));
};
const triesOf = (text) => {
  let ast = null;
  for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { ast = null; } }
  if (!ast) return null;
  const out = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'TryStatement' && n.handler) out.push({ start: n.block.start, end: n.block.end, swallow: swallows(n.handler) });
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) { for (const x of v) visit(x); } else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v); }
  };
  visit(ast);
  return out;
};
const SKIP_DIRS = ['src/lib', 'src/agentd'];   // the page's bundle (its own half below) and the device's (no HostManager there)
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.includes(rel)) walk(rel, out); }
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
};
const serverFiles = () => new Map(['server.js', ...walk('src')].map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
// the column of every lookup on a line (the server census's own pattern; the page's half judges no catch)
// 主开发 01:20Z (1): + the hosts methods that call get INSIDE (device, deviceBounded, homeDir, the transcript fetches) — a held list
// throws through them the same way, so a new caller of those is a row too (the is-it-paired lookup, findByDeviceId, was counted already)
const LOOKUP = /\b(?:hosts|_hosts|getHosts)(?:\?\.)?(?:\(\))?\??\.(?:get|list|findByDeviceId|device|deviceBounded|homeDir|fetchTranscript|fetchSessionJsonl|fetchCodexJsonl|fetchAgentJsonl)\??\.?\(|\bthis\.(?:get|list|findByDeviceId)\(/g;
const lookupCols = (file, ln) => [...ln.matchAll(LOOKUP)].filter((m) => file === 'src/hosts.js' || !m[0].startsWith('this.')).map((m) => m.index);
function census(files, rows, { siteOf, bareRule = true }) {
  const sites = [], unparsed = [];
  for (const [file, text] of files) {
    const lines = text.split('\n');
    let tries, off = 0;
    const starts = lines.map((l) => { const o = off; off += l.length + 1; return o; });
    lines.forEach((ln, i) => {
      if (COMMENT.test(ln)) return;
      const n = siteOf(file, ln); if (!n) return;
      const row = rows.filter((r) => r.file === file && ln.includes(r.at)).sort((a, b) => b.at.length - a.at.length)[0] || null;   // the most specific row (a longer `at` on the same line)
      const w = ln + (i + 1 < lines.length && /^\s*\}?\s*catch\b/.test(lines[i + 1]) ? '\n' + lines[i + 1] : '');
      let inTry = false;
      if (bareRule) {
        if (tries === undefined) { tries = triesOf(text); if (!tries) unparsed.push(file); }
        // each lookup ON the line is judged where it stands (a `try { return !!hosts.get(id) } catch (e) {…}` later on the line is its own)
        for (const col of lookupCols(file, ln)) {
          const at = starts[i] + col, inner = (tries || []).filter((t) => t.start <= at && at < t.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
          if (inner && inner.swallow) inTry = true;
        }
      }
      sites.push({ file, line: i + 1, n, row, bare: bareRule && (BARE.test(w) || inTry), text: ln.trim().slice(0, 160) });
    });
  }
  const unrowed = sites.filter((s) => !s.row), moved = [], dead = [], bare = [], staleBare = [];
  for (const r of rows) {
    const mine = sites.filter((s) => s.row === r), got = mine.reduce((k, s) => k + s.n, 0);
    if (!got) { dead.push(`${r.file} «${r.at}»`); continue; }
    if (got !== r.n) moved.push(`${r.file} «${r.at}»: ${r.n} → ${got}`);
    if (bareRule && !r.bare && mine.some((s) => s.bare)) bare.push(`${r.file}:${mine.find((s) => s.bare).line} «${r.at}»`);
    if (bareRule && r.bare && !mine.some((s) => s.bare)) staleBare.push(`${r.file} «${r.at}»`);
  }
  return { sites, unrowed: unrowed.map((s) => `${s.file}:${s.line} ${s.text}`), moved, dead, bare, staleBare, unparsed };
}
const CLASSES = ['waits', 'refuses', 'harmless', 'not-hosts'];

// ── §1 every caller of a lookup in the server is a row ──────────────────────────────────────────────────────────────────────────
console.log('§1 every caller of a lookup (get / list / findByDeviceId, and the methods that call get inside: device / deviceBounded / homeDir / the transcript fetches) in the server is a row');
{
  const ROWS = [
    {"file": "server.js", "at": "const hostTokens = require('./src/server/host-tokens.js').create({ dataDir: path.join(__dirname,", "n": 3, "cls": "harmless", "why": "hostTokens.create({nameOf}) (findByDeviceId / get) — Bare catch (host-tokens) hides the hold, harmlessly (a display name). findByDeviceId learn held: no · lane lg-remote-hardening: + anyHubPin — a HELD list counts as a pin (true: host-tokens' «a pin exists»), so this hub's own key is never minted anew in silence while the machines are unread"},
    {"file": "server.js", "at": "const h = hosts.get(hostId);", "n": 2, "cls": "harmless", "why": "a usage push / an ssh device's connect needs a live remote link — unreachable while held (every connect meets the hold first)", "bare": "unreachable while held (an ssh device connected / a usage push needs a live link); a removed machine: nothing to do"},
    {"file": "server.js", "at": "const out = await graduateHostToDial(hosts.get(hostId), { by: 'system:graduate', serverUrl: base });", "n": 1, "cls": "harmless", "why": "armed only by an ssh device's connect — unreachable while held"},
    {"file": "server.js", "at": "const hostName = s.host ? (() => { try { return hosts.get(s.host)?.name || s.host; } catch { ret", "n": 1, "cls": "harmless", "why": "sessionAuth hostName — Display"},
    {"file": "server.js", "at": "access: () => desktopAccess, hostLabel: (h) => { try { return hosts.get(h).name || h; } catch { ", "n": 1, "cls": "harmless", "why": "desktopKeeper hostLabel — Display"},
    {"file": "server.js", "at": "remoteHosts: () => { try { return hosts.list().filter((h) => (h.transport === 'dial' ? h.online ", "n": 1, "cls": "harmless", "why": "the desktop keeper's boot adoption list — while held it asks none; each machine meets desktop-access notHeld (host_unavailable, kept offline) and the tick asks again after the read", "bare": "held: an empty list adopts nothing and drops nothing (the records stay)"},
    {"file": "server.js", "at": "try { machineMounts.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "harmless", "why": "dial-in accepted: unreachable while held — the dial gate answers every dial 503 (holdDial)", "bare": "unreachable while held; a removed machine: nothing to link"},
    {"file": "server.js", "at": "try { portForwards.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "harmless", "why": "dial-in accepted: unreachable while held — the dial gate answers every dial 503 (holdDial)", "bare": "unreachable while held; a removed machine: nothing to link"},
    {"file": "src/exit-proxy.js", "at": "_hosts() { try { return this.hosts.list?.() || []; } catch { return []; } }", "n": 1, "cls": "refuses", "why": "_hosts(): listFor / _judge refuse first while held (hosts-unread 503 to the agent); pruneLists has its own held belt; GET /api/exits has no page reader", "bare": "the readers above it ask held() first; a failed list lends nothing (fail closed)"},
    {"file": "src/exit-proxy.js", "at": "_raw(hostId) { try { return this.hosts.get(hostId); } catch { return null; } }", "n": 1, "cls": "refuses", "why": "_raw(): view / setAccess refuse first while held (_refuseIfHeld, hosts-unread 503); access() / _credOk lend nothing — no forward opens while held", "bare": "the readers that name an absence refuse first; null lends nothing (fail closed)"},
    {"file": "src/exit-proxy.js", "at": "try { const h = this.hosts.get(hostId); lastRun = h ? (this.accessOf(h).lastRun || null) : null;", "n": 1, "cls": "harmless", "why": "_rowRecorded: needs a recorded run — unreachable while held (no run can start)", "bare": "a run's last-run stamp only — nothing judged on it"},
    {"file": "src/hosts.js", "at": "const known = () => { try { return !!this.get(id); } catch { return false; } };", "n": 1, "cls": "harmless", "why": "realCwdOf (B-16d7, the move onto the .413 tip): the live row's real-path field — the last-known list is noted only for a machine the list knows", "bare": "held: «not known yet» — the last-known list is not noted, the row carries no real path this payload; nothing written, asked again at the next payload"},
    {"file": "src/server/rewind-files-door.js", "at": "try { dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, statMs) : null; } catch { dm = null; }", "n": 1, "cls": "harmless", "why": "row B-437e files tier: a paired machine's listed files' times for the confirm — held, no agent is reached: every listed file reads «could not be checked: unreadable» and the choice drawn is «the conversation only»; nothing is put back without the person's pick", "bare": "held or unreachable: every file «could not be checked» (the safe reading); the person may still pick the files knowingly"},
    {"file": "src/server/rewind-kept-door.js", "at": "const nameOf2 = (hosts, id) => { if (!id) return null; try { const h = hosts && typeof hosts.get === 'function' ? hosts.get(id) : null; return (h && (h.name || h.label)) || String(id); } catch { return String(id); } };", "n": 1, "cls": "harmless", "why": "B-437e U3: a kept line's machine NAME for words (a held or unknown machine reads as its id; nothing waits or refuses on it)"},
    {"file": "src/server/rewind-kept-door.js", "at": "try { if (!agent) agent = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, 2000) : null; } catch { agent = null; }", "n": 1, "cls": "harmless", "why": "row B-437e the kept copy: a paired machine's agent for its keep, its sweep and its put-back — held, no agent is reached: «cannot keep a copy», so the files press is refused with nothing put back", "bare": "held or unreachable: nothing is kept, so nothing is put back (the safe reading)"},
    {"file": "src/server/left-behind-door.js", "at": "const nameOfHost = (hosts, id) => { try { const h = hosts && typeof hosts.get === 'function' ? hosts.get(id) : null; return (h && h.name) || String(id); } catch { return String(id); } };", "n": 1, "cls": "harmless", "why": "the after-stop note's machine name (a display line): held, the machine's id stands for its name — nothing read from it, written or dropped"},
    {"file": "src/server/left-behind-door.js", "at": "const dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, 6000) : null;", "n": 1, "cls": "harmless", "why": "after a stopped turn on another machine: what its command tool left running, read from that machine's agent — held, its catch names the check unread by the hold's own reason («hosts-unread», never «machine-unreachable»): nothing is read, written or dropped; the next stop asks again"},
    {"file": "src/server/settings-merge-device.js", "at": "const dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(hostId, boundMs) : null;", "n": 1, "cls": "harmless", "why": "B-e7c0: a paired start's ONE ask of its agent to merge the person's settings file there — held, the ask's catch answers {refused} and the create keeps the release's set-aside, said as today: nothing is written on either side; the next start asks again"},
    {"file": "src/server/left-behind-door.js", "at": "try { dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, LB.PRESS_MS * 2) : null; } catch (e) { dm = null; held = e && e.code === 'hosts-unread' ? 'hosts-unread' : null; }", "n": 1, "cls": "harmless", "why": "B-69a7 (b): a person's press on a paired machine's left-behind line — held, no agent is reached: the press answers «hosts-unread» (worded by its code, as every held reader: hostsHeldWords) and the line keeps its list: nothing is signalled; the next press asks again"},
    {"file": "src/hosts.js", "at": "const h = this.get(id);", "n": 33, "cls": "refuses", "why": "every method that opens with this.get(id) (r3431: + hopKeyScan, the jump host's scan): readRemotePassiveUsage (B-5e0d, its caller usage-routes catches to «no passive reading»), accountsStatus, renameHostSubDir, cliPrimaryKey, test, killRemotePid, reachable, refuseUnreachable, dirComplete, dirSlice, back · lane lg-remote-hardening: + hostKeyScan, pinHostKeys (its record read after the scan), unpinHostKeys — each refused by name while held before anything is scanned or written"},
    {"file": "src/hosts.js", "at": "const h = this.findByDeviceId(deviceId);", "n": 2, "cls": "harmless", "why": "onDialIn / noteDial: a dialed-in device — unreachable while held (holdDial); findByDeviceId throws hosts-unread there by name"},
    {"file": "src/hosts.js", "at": "let h = this.findByDeviceId(deviceId);", "n": 1, "cls": "refuses", "why": "setDialToken: a writer — refused by name while held (_refuseIfUnread before it); findByDeviceId throws hosts-unread"},
    {"file": "src/hosts.js", "at": "if (!h) { this.add({ name: name || deviceId, transport: 'dial', deviceId }); h = this.findByDevi", "n": 1, "cls": "refuses", "why": "setDialToken: a writer — refused by name while held (_refuseIfUnread before it)"},
    {"file": "src/hosts.js", "at": "dialTokenHash(deviceId) { return this.findByDeviceId(deviceId)?.dialTokenHash || null; }", "n": 1, "cls": "refuses", "why": "dialTokenHash: «is it paired» — throws hosts-unread while held (findByDeviceId); its one live caller (the dial gate) holds the dial first"},
    {"file": "src/hosts.js", "at": "try { const h = hostId === 'local' ? null : this.get(hostId); if (h) machine = h.name || h.id; }", "n": 1, "cls": "harmless", "why": "a dialed-in device's act / policy facts — unreachable while held (every dial is held off); a display name otherwise", "bare": "a machine's display name in an act line — its id meanwhile"},
    {"file": "src/hosts.js", "at": "let h = null; try { h = this.get(hostId); } catch { return false; }", "n": 4, "cls": "harmless", "why": "noteAct / notePolicy / noteElevated / noteRuntime: a dialed-in device's facts — unreachable while held · lane lg-remote-hardening: + noteDeviceKey (a device key learned / refused — unreachable while held: no link is built while held, nothing pinned)", "bare": "unreachable while held; a removed machine records nothing"},
    {"file": "src/hosts.js", "at": "const cur = this.findByDeviceId(rec.deviceId);", "n": 1, "cls": "refuses", "why": "importBundle: refused while held before it (skipped, the warning says why)"},
    {"file": "src/hosts.js", "at": "if (!v.ok) throw unreachableError(this.get(id), v.line);", "n": 1, "cls": "refuses", "why": "refuseUnreachable: get throws hosts-unread by name while held"},
    {"file": "src/hosts.js", "at": "const h = this.get(hostId);", "n": 2, "cls": "refuses", "why": "opencodeOp: get throws hosts-unread by name while held (the op refuses) · lane lg-remote-hardening: + forgetDeviceKey (Forget / Let in without a key — get throws hosts-unread by name while held; its route answers 503)"},
    {"file": "src/hosts.js", "at": "let h; try { h = this.get(id); } catch { return 'unknown'; }   // ALSO CURED: a removed machine'", "n": 1, "cls": "refuses", "why": "linkState: held answers «offline» first (the pool's dark-source defense stays on) — H3", "bare": "a removed machine is «unknown» (it threw, and one removed source emptied the whole dark list — ALSO CURED)"},
    {"file": "src/hosts.js", "at": "try { return this.convIndex.ownerHost(sessionId, (hid) => { if (this._unread) return true; try {", "n": 1, "cls": "waits", "why": "conversationOwner: held keeps every claim («unknown», never «gone»)", "bare": "a removed machine's claim is FILTERED (ALSO CURED: it threw inside the filter)"},
    {"file": "src/incident.js", "at": "const h = hosts.get?.(hid) || (hosts.list?.() || []).find((x) => x.id === hid);", "n": 2, "cls": "refuses", "why": "the incident report's machine probe: get throws hosts-unread by name — the row reads that error"},
    {"file": "src/machine-mounts.js", "at": "hostId: (this.hosts.held?.() ? null : this.hosts.findByDeviceId?.(m.deviceId)?.id) || (/^grad-/.", "n": 1, "cls": "harmless", "why": "_migrateLegacy (a legacy file from before 2.160.0): while held no device is looked up — the key is derived as the pairing minted it (grad-<host id> / host-dial-<id>), and the one-time ingest runs (H10)"},
    {"file": "src/machine-mounts.js", "at": "const h = this.hosts.get(hostId);", "n": 3, "cls": "waits", "why": "_online / the restore / the health sweep: while held a machine reads offline (shown, a heal tried again later) — no record is changed on it", "bare": "_online / the restore / the health sweep: false = offline (a display, a heal tried later); every change refuses the hold by name before it"},
    {"file": "src/machine-mounts.js", "at": "const dial = (() => { try { return this.hosts.get(hostId).transport === 'dial'; } catch { return", "n": 1, "cls": "harmless", "why": "_davBase dial check: unreachable while held (a mount's road needs its machine, which refuses first)", "bare": "false = the ssh road, which then meets the hold by name"},
    {"file": "src/machine-mounts.js", "at": "const mName = (() => { try { return this.hosts.get(pull.hostId)?.name || pull.hostId; } catch { ", "n": 1, "cls": "harmless", "why": "a refusal's words name the machine by its id meanwhile"},
    {"file": "src/machine-mounts.js", "at": "const h = this.hosts.get(hostId); // throws for unknown machine", "n": 1, "cls": "refuses", "why": "_mountPullInner: get throws hosts-unread by name — the pull mount is refused"},
    // the stores chain's restack onto checkpoint 60 meets line 244 (bl-machines-a's PAIR hold — another meaning than this census's hold):
    {"file": "src/machine-mounts.js", "at": "let name = null; try { name = this.hosts.get(o.hostId).name || o.hostId; } catch (e) { name = e && e.code === 'hosts-unread'", "n": 1, "cls": "harmless", "why": "a holder row's shares (line 244): while the machines list is held the other row's machine is named by its id — never «removed» (the restack's cure)"},
    {"file": "src/machine-mounts.js", "at": "let name = null; try { name = this.hosts.get(other.hostId).name || other.hostId; } catch (e) { name = e && e.code === 'hosts-unread'", "n": 1, "cls": "harmless", "why": "_conflictWords (line 244): while held the other record's machine is named by its id — never «a removed machine» (the restack's cure)"},
    {"file": "src/machine-mounts.js", "at": "let listed = true; try { this.hosts.get(hostId); } catch (e) { listed = !(e && e.code === 'host_not_found'); }", "n": 1, "cls": "harmless", "why": "_hostInCopy (the MOVE, part one): a page flag only — held reads as listed (unknown: no machine shows as removed while held), host_not_found as not listed, then the kept copies are asked; nothing is removed"},
    {"file": "src/machine-mounts.js", "at": "_hostListed(hostId) { try { this.hosts.get(hostId); return true; } catch (e) { return !(e && e.code === 'host_not_found'); } }", "n": 1, "cls": "harmless", "why": "_hostListed (r3813, part one's words follow): words only — a remount's refusal (machine_not_listed, never «start its daemon») and a push unmount's answer (its machine side not-listed); held reads as listed (unknown), host_not_found as not listed; nothing is removed by it"},
    {"file": "src/machine-mounts.js", "at": "const gone = (m) => { try { this.hosts.get(m.hostId); return false; } catch { return true; } };", "n": 1, "cls": "waits", "why": "_recheckPairs (line 244) WAITS while the machines list is held — judged once it reads (keyed whenRead), the current pair holds standing (the restack's cure: held, every record read «gone» and every hold was dropped)", "bare": "true = its machine removed — reached only on a list that reads"},
    {"file": "src/machine-mounts.js", "at": "const dialUp = (m) => { try { const h = this.hosts.get(m.hostId);", "n": 1, "cls": "waits", "why": "_recheckPairs (line 244): unreachable while held — the check waits for the read", "bare": "false = cannot mount now — reached only on a list that reads"},
    {"file": "src/port-forward.js", "at": "try { all = (this.hosts.list?.() || []); } catch { return; }", "n": 1, "cls": "harmless", "why": "the forwards' watch sweep: an empty list sweeps nothing (no forward is dropped)", "bare": "held: nothing to sweep this tick; it runs again"},
    {"file": "src/remote-fs.js", "at": "try { dial = this.hosts.get(id)?.transport === 'dial'; } catch { }", "n": 2, "cls": "refuses", "why": "remote-fs _dev dial check, and write's over-the-line check (B-7f0b D8: a dialed machine is refused by name): the next step (_host) throws hosts-unread by name", "bare": "false = the ssh road, which meets the hold by name"},
    {"file": "src/remote-fs.js", "at": "_host(id) { return this.hosts.get(id); }", "n": 1, "cls": "refuses", "why": "remote-fs _host: get throws hosts-unread by name — every remote file operation refuses it (routes/files.js answers the words)"},
    {"file": "src/routes/persistence.js", "at": "hosts: (getHosts?.()?.list?.() || []).length, hostsUnread: (getHosts?.()?.held?.() && getHosts()", "n": 1, "cls": "refuses", "why": "the export preview: the count and the hold's words (hostsUnread) — the page says it, never «no hosts configured» (H15); an export that asks for machines is refused 503"},
    {"file": "src/server/account-usage-routes.js", "at": "try { hostName = ev.host ? (hosts.get(ev.host)?.name || null) : null; } catch { }", "n": 1, "cls": "harmless", "why": "the usage-event popup's machine name — an id shows meanwhile", "bare": "display only"},
    {"file": "src/routes/account-tails.js", "at": "try { out.hostNames = Object.fromEntries((hosts?.list?.() || []).map((h) => [h.id, h.name || h.id", "n": 1, "cls": "harmless", "why": "GET /api/accounts hostNames — ids show meanwhile (moved from src/server/account-usage-routes.js on the train: the restack's census meeting)", "bare": "display only"},
    {"file": "src/server/account-usage-routes.js", "at": "const facts = { ...r, hostId: req.params.id, transport: hosts.get(req.params.id)?.transport === ", "n": 1, "cls": "refuses", "why": "the per-host verdicts run after the route's first lookup, which refuses the hold by name", "bare": "the route's first lookup (accountsStatus) refuses the hold by name; this verdict pass runs only after it answered"},
    {"file": "src/server/account-usage-routes.js", "at": "const hostName = (() => { try { return hosts.get(req.body?.hostId)?.name; } catch { return null;", "n": 1, "cls": "harmless", "why": "the CLI login import's machine name — an id shows meanwhile", "bare": "display only"},
    {"file": "src/server/account-usage-routes.js", "at": "const sweep = () => { for (const h of hosts.list() || []) { try { ", "n": 4, "cls": "waits", "why": "an account delete's remote folder sweep waits for the read (whenRead); each machine's ssh dial is built from its record (hosts.get(h.id), lane lg-remote-hardening r3688: a list row is a view)", "bare": "one machine unreachable: the sweep goes on to the next"},
    {"file": "src/server/cli-level-reported.js", "at": "let known = true; try { known = !(hosts && typeof hosts.get === 'function') || !!hosts.get(hostId); } catch { known = true; }", "n": 1, "cls": "harmless", "why": "B-24e2 follow-up: the door's «no longer paired» — said only for a machine the list READ does not hold; a HELD list (it throws) is unknown and the door goes on to its link (not connected until it reads)", "bare": "a held list is never taken for «no longer paired»: unknown, the door reads the link next"},
    {"file": "src/server/conversation-facts.js", "at": "const nameOf = (h) => { try { const x = hosts.get(h); return (x && x.name) || null; } catch { return null; } };", "n": 1, "cls": "harmless", "why": "B-24e2: the paired machine's NAME for the words and the journal only — a held list leaves the id in its place; the ask itself (hosts.cliLevelOf) asks only a connected machine and ends, said, when it rejects", "bare": "the name of a machine for words only: a held list gives its id instead, nothing is judged on it"},
    {"file": "src/server/artifact-registry.js", "at": "for (const id of new Set(ids.map((x) => String(x || '')).filter((x) => x && x !== 'local'))) { l", "n": 1, "cls": "harmless", "why": "artifact rows' machine names — ids show meanwhile", "bare": "display only"},
    {"file": "src/server/boot-restore.js", "at": "const h = hosts.get?.(meta.host);", "n": 1, "cls": "waits", "why": "the boot's re-adoption of remote sessions left running WAITS for the read (whenRead) — it ended the boot's one pass and a later resume killed the agent it would adopt"},
    {"file": "src/server/browser-access.js", "at": "try { return !!hosts.get(hostId); } catch { return false; }", "n": 1, "cls": "refuses", "why": "browser-access hostKnown: its readers ask machinesHeld() first (host_unavailable by name — H9, H25)", "bare": "its readers ask the hold first; false here is «not this machine» only after them"},
    {"file": "src/server/cwd-wait.js", "at": "const h = hosts ? call(() => hosts.get(hostId), null) : null;", "n": 1, "cls": "harmless", "why": "a mount's machine named in the cwd wait's words — its id meanwhile (the call answers null on the hold)"},
    {"file": "src/server/desktop-access.js", "at": "try { return !!hosts.get(hostId); } catch { return false; }", "n": 1, "cls": "refuses", "why": "desktop-access hostKnown: notHeld() refuses host_unavailable first", "bare": "notHeld() runs before it"},
    {"file": "src/server/desktop-access.js", "at": "const hostList = () => { try { return hosts && typeof hosts.list === 'function' ? hosts.list() :", "n": 1, "cls": "harmless", "why": "desktop-access hostList: the machines' desktop rows — none listed while held, nothing dropped", "bare": "display: an empty list drops no record"},
    {"file": "src/server/desktop-access.js", "at": "let machine = hostId; try { const h = hosts && hosts.get ? hosts.get(hostId) : null; machine = S", "n": 1, "cls": "harmless", "why": "the audit line's machine name — its id meanwhile", "bare": "the audit line's machine name — its id meanwhile"},
    {"file": "src/server/desktop-access.js", "at": "const hostName = (hostId) => { try { const h = hosts && hosts.get ? hosts.get(hostId) : null; re", "n": 1, "cls": "harmless", "why": "a display name — its id meanwhile"},
    {"file": "src/server/desktop-access.js", "at": "try { list = hosts && typeof hosts.list === 'function' ? hosts.list() : []; } catch { list = [];", "n": 1, "cls": "harmless", "why": "the sign-ins view's machines — none listed while held", "bare": "display only"},
    {"file": "src/server/dial-health-watch.js", "at": "for (const h of hosts.list()) if (h && h.deviceId) { observe(h, { connected: liveOf(h) }); n++; ", "n": 1, "cls": "waits", "why": "an empty list observes nothing this round; the next sweep after the read observes again — nothing is recorded on an absence"},
    {"file": "src/server/dial-health-watch.js", "at": "const byDevice = (deviceId) => { const h = hosts && hosts.findByDeviceId?.(deviceId); return h ?", "n": 1, "cls": "harmless", "why": "byDevice (findByDeviceId) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "const generation = (() => { try { return Number(hosts.findByDeviceId(deviceId)?.dial?.generation", "n": 1, "cls": "harmless", "why": "agentdMintDialPair (findByDeviceId) — learn held: no (guard the route — H12)", "bare": "the mint's generation — unreachable while held (the pair route refuses first); 1 for a new device"},
    {"file": "src/server/dial-pairing.js", "at": "try { const h = hosts.findByDeviceId(deviceId); hosts.onDeviceAlert?.('pairing-minted', { hostKe", "n": 1, "cls": "harmless", "why": "agentdMintDialPair (findByDeviceId) — learn held: no (guard the route — H12)"},
    {"file": "src/server/dial-pairing.js", "at": "if (event === 'disconnected') { try { machineMounts.onMachineUnlinked(hosts.findByDeviceId(devic", "n": 1, "cls": "harmless", "why": "a dial link's end — unreachable while held (no dial accepted)", "bare": "unreachable while held"},
    {"file": "src/server/dial-pairing.js", "at": "{ const w = machineMounts.revokeHeldFor && machineMounts.revokeHeldFor(hosts.findByDeviceId(deviceId)?.id);", "n": 1, "cls": "refuses", "why": "unpairDialDevice: refused by name while held (its belt, above it) — B-f276 family unit 1 (round wom600meg): the machine's push tokens asked before any side effect"},
    {"file": "src/server/dial-pairing.js", "at": "try { await machineMounts.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id, { now: true", "n": 1, "cls": "refuses", "why": "unpairDialDevice: refused by name while held (its belt) — no half teardown", "bare": "after the belt: a removed machine's parts"},
    {"file": "src/server/dial-pairing.js", "at": "try { portForwards.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id, { now: true", "n": 1, "cls": "refuses", "why": "unpairDialDevice: refused by name while held (its belt)", "bare": "after the belt: a removed machine's parts"},
    {"file": "src/server/dial-pairing.js", "at": "try { exitProxy.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "refuses", "why": "unpairDialDevice: refused by name while held (its belt)", "bare": "after the belt: a removed machine's parts"},
    {"file": "src/server/dial-pairing.js", "at": "onUpgradeStuck: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpg", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onVersionMatch: (v) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('match", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onUpgradeBegin: (from, to) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onAnswer: (v) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('answered', ", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onAct: (line) => { const h = hosts.findByDeviceId(deviceId); hosts.noteAct(h ? h.id : 'host-dial", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onUpgradeRefused: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentU", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onUpgradeTrusted: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentU", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "onPolicy: (p) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.notePolicy?.(h.id, p", "n": 1, "cls": "harmless", "why": "a dialed-in device's hooks — unreachable while held", "bare": "unreachable while held; a broadcast that fails changes no record"},
    {"file": "src/server/dial-pairing.js", "at": "onElevated: (e) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteElevated?.(h.i", "n": 1, "cls": "harmless", "why": "a dialed-in device's hooks — unreachable while held", "bare": "unreachable while held; a broadcast that fails changes no record"},
    {"file": "src/server/dial-pairing.js", "at": "onRuntime: (rt) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteRuntime?.(h.id", "n": 1, "cls": "harmless", "why": "a dialed-in device's hooks — unreachable while held", "bare": "unreachable while held; a broadcast that fails changes no record"},
    {"file": "src/server/dial-pairing.js", "at": "machine: () => { const h = hosts.findByDeviceId(deviceId); return (h && h.name) || deviceId; },", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/dial-pairing.js", "at": "actGate: hosts.actGateFor(() => { const h = hosts.findByDeviceId(deviceId); return h ? h.id : 'h", "n": 1, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (findByDeviceId ×11) — learn held: no"},
    {"file": "src/server/exit-routes.js", "at": "try { h = hosts.get(req.params.id); } catch { }", "n": 1, "cls": "refuses", "why": "GET exit-runs: 503 hosts-unread first while held — never «no such machine» (H18)", "bare": "after the held check: a removed machine is 404"},
    {"file": "src/server/exit-routes.js", "at": "if (req.params.id === 'local') h = { id: 'local', name: 'this machine' }; else { try { h = hosts", "n": 1, "cls": "refuses", "why": "GET device-acts: 503 hosts-unread first while held (H18)", "bare": "after the held check: a removed machine is 404"},
    {"file": "src/server/exit-routes.js", "at": "const list = (() => { try { return hosts.list(); } catch { return []; } })();", "n": 1, "cls": "refuses", "why": "the agent's remote audit: 503 hosts-unread first while held — never «no machine here» (H24)", "bare": "after the held check: a failed list names no machine"},
    {"file": "src/server/exit-routes.js", "at": "const list = hosts.list().map((h) => { if (!h || typeof h !== 'object') return h; let exit; try ", "n": 1, "cls": "refuses", "why": "GET /api/hosts: the empty list with `unread` (the hold's words) — every page reader reads it (§4)"},
    {"file": "src/server/exit-routes.js", "at": "await removeHost(hosts.get(req.params.id));", "n": 1, "cls": "refuses", "why": "DELETE /api/hosts/:id: refused 503 hosts-unread BEFORE the lookup (the unpair teardown never runs)"},
    {"file": "src/server/hub-act-ask.js", "at": "const rawOf = (hostId) => { try { return hosts.get(hostId); } catch { return null; } };", "n": 1, "cls": "harmless", "why": "hub-act rawOf: its reevaluate asks held() first (the stored standing is kept); a check needs a live device — unreachable while held", "bare": "its judging readers ask the hold first"},
    {"file": "src/server/incident-wiring.js", "at": "try { out.hosts = (hosts?.list?.() || []).map((h) => ({ id: h.id, name: h.name, transport: h.dia", "n": 1, "cls": "harmless", "why": "the incident report's machine list — none while held (the report is a snapshot)", "bare": "a report never fails for its machine list"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const vaultHostOf = (k) => { try { const s = String(k || ''); return s ? (s.startsWith('dial-') ", "n": 2, "cls": "harmless", "why": "vault rows' machine names — ids show meanwhile", "bare": "display only"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "hostKnown: (h) => { try { return !!(hosts && hosts.get(h)); } catch { return false; } },", "n": 1, "cls": "harmless", "why": "chat attachments' machine check — reachable while held: a picture from a machine answers 400 bad_place (a broken picture); no record is touched", "bare": "false refuses the attachment; no record is touched"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const gradDevice = hosts.get(h.id).deviceId;", "n": 1, "cls": "refuses", "why": "graduateHostToDial: its route's own lookup refuses by name first"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const h = hosts.get(req.params.id);", "n": 1, "cls": "refuses", "why": "POST graduate-dial: get throws hosts-unread by name — the route answers it"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const nv = DF.pairRequestVerdict({ deviceId, expect: req.body?.expect === 'new' ? 'new' : req.bo", "n": 1, "cls": "refuses", "why": "the pair route: 503 hosts-unread BEFORE the name verdict (H12)"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const nv2 = DF.pairRequestVerdict({ deviceId, expect: req.body?.expect === 'new' ? 'new' : req.b", "n": 1, "cls": "refuses", "why": "the pair route: the held check runs again after the relay's await (H12)"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const existed = !!hosts.findByDeviceId(deviceId);", "n": 1, "cls": "refuses", "why": "the pair route: past both held checks"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const liveRec = existed ? hosts.findByDeviceId(deviceId) : null;", "n": 1, "cls": "refuses", "why": "the pair route: past both held checks"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "try { h = hosts.get(req.params.id); } catch (e) { return e && e.code === 'hosts-unread' ? res.st", "n": 1, "cls": "refuses", "why": "dial-status: 503 hosts-unread by name — never «no such machine» (H19)"},
    {"file": "src/server/stdout/claude-stream-json.js", "at": "try { h = hosts.get(session.host); } catch { h = null; }", "n": 1, "cls": "harmless", "why": "the linked-worktree probe — a remote session is not probed meanwhile", "bare": "a hint only"},
    {"file": "src/server/sysinfo-wiring.js", "at": "const h = hosts.get(hostId);", "n": 3, "cls": "refuses", "why": "remoteSysinfo: get throws hosts-unread by name — the System panel's machine row says it"},
    {"file": "src/server/task-groups-wiring.js", "at": "let h; try { h = hosts().get(session.host); } catch { return; }", "n": 1, "cls": "waits", "why": "the context sync of a remote session — skipped this time, the 60 s timer asks again", "bare": "it tries again on its timer"},
    {"file": "src/server/task-groups-wiring.js", "at": "let h; try { h = hosts().get(s.host); } catch { continue; }", "n": 1, "cls": "waits", "why": "the 60 s context timer — skips the machine this round", "bare": "it tries again on its timer"},
    {"file": "src/server/task-groups-wiring.js", "at": "if (!home) { try { hosts().homeDir(hosts().get(session.host)); } catch { } return null; } // war", "n": 2, "cls": "harmless", "why": "the remote context base warm-up — warmed later", "bare": "a cache warm-up only"},
    {"file": "src/spawn/ssh.js", "at": "const h2 = hosts.get(data.hostId);", "n": 1, "cls": "harmless", "why": "the tools' ship for a create already past its own lookup (which refuses by name)"},
    {"file": "src/usage-routes.js", "at": "const want = req.body?.host ? [req.body.host] : hosts.list().map((h) => h.id);", "n": 1, "cls": "waits", "why": "an empty list harvests nothing this round; asked again later — nothing is judged on an absence"},
    {"file": "src/usage-routes.js", "at": "let hMeta2; try { hMeta2 = hosts.get(hid); } catch (e) { return e && e.code === 'hosts-unread' ?", "n": 1, "cls": "refuses", "why": "the per-machine usage ⟳: 503 hosts-unread by name — never «unknown host» (H20)"},
    {"file": "src/usage-routes.js", "at": "let hMeta; try { hMeta = hosts.get(hid); } catch (e) { return e && e.code === 'hosts-unread' ? r", "n": 1, "cls": "refuses", "why": "the per-machine usage ⟳: 503 hosts-unread by name — never «unknown host» (H20)"},
    {"file": "src/usage-routes.js", "at": "for (const h of hosts?.list() || []) out[h.id] = { ...(_hostUsage[h.id] || {}), name: h.name };", "n": 1, "cls": "harmless", "why": "a usage snapshot for display — no machine rows meanwhile"},
    {"file": "src/writer-sweep.js", "at": "const h = hosts.get(hostId);", "n": 1, "cls": "refuses", "why": "the writer sweep's ssh fallback: get throws hosts-unread by name (the resume refuses first)"},
    {"file": "src/ws-create.js", "at": "if (hosts.get(hd) && fs.existsSync(path.join(cacheRoot, hd, cacheRel))) owners.push(hd);", "n": 1, "cls": "refuses", "why": "the host-less resume: refused by name while held BEFORE the cache scan — never resumed on this machine (H4)", "bare": "the held check refuses the resume by name BEFORE this scan (H4); after it, a removed machine owns nothing"},
    {"file": "src/ws-create.js", "at": "try { const hh = hosts.get(data.hostId); cwd = (hh && await hosts.homeDir(hh)) || ''; } catch { ", "n": 2, "cls": "harmless", "why": "a remote create's default folder — the create meets the hold by name next", "bare": "the create refuses right after it"},
    {"file": "src/ws-create.js", "at": "const hh = hosts.get(data.hostId);", "n": 3, "cls": "harmless", "why": "the cwd preflight never blocks a create; the create meets the hold by name next (its own lookup)", "bare": "the cwd preflight never blocks a create; the create meets the hold by name next (its own lookup, H16)"},
    {"file": "src/ws-create.js", "at": "const facts = { ...rs, hostId: data.hostId, transport: spawnFor(hosts.get(data.hostId) || {}).id", "n": 2, "cls": "harmless", "why": "account facts for a create already past its lookup (which refuses by name)", "bare": "account facts for a create already past its lookup (which refuses the hold by name)"},
    {"file": "src/ws-create.js", "at": "try { h = hosts.get(data.hostId); }", "n": 2, "cls": "refuses", "why": "a remote create / resume: the hold's code and translated words — never «Unknown host» (H16)"},
    {"file": "src/ws-create.js", "at": "const hostName = data.hostId ? (() => { try { const h = (hosts && hosts.get(data.hostId)) || {};", "n": 1, "cls": "harmless", "why": "the key-helper notice names the machine — no name meanwhile (a create past its own lookup, which refuses the hold by name)", "bare": "a display name only"},
    {"file": "src/ws-handler.js", "at": "const h = hosts.get(session.host);", "n": 1, "cls": "waits", "why": "Terminate of a remote conversation: said unconfirmed by name, the remote stop OWED and run at the read (whenRead) — H1", "bare": "the remote stop runs only when the list is READ (while held it is said and owed at the read, H1); a failed remote stop after that is best-effort, as the release"},
    // the move onto 418bc7210: the train's new callers since the cure's base (the meeting commit)
    {"file": "src/machine-mounts.js", "at": "try { h = this.hosts.get(m.hostId); } catch (e) { h = e && e.code === 'hosts-unread'", "n": 1, "cls": "refuses", "why": "shadowedBy (B-fcc7, the train): a held list is unknown, never «removed» — the record still shadows its bare folder (named by its id), so a write there is refused as the hold (hosts-unread, the moved chain's cure — never «offline»); a reader sees the shadow when probed empty"},
    {"file": "src/machine-mounts.js", "at": "let known = false; try { this.hosts.get(o.hostId); known = true; } catch (e) { known = !!(e && e.code === 'hosts-unread'); }", "n": 1, "cls": "refuses", "why": "shadowedBy's tie (B-02f6's remainder): while the machines list is held the holder is still known (hosts-unread) — it answers for the held row by the LIST's hold under its own name (the row above refuses it); a holder whose machine is gone (no hold) never answers — the held row's own hold refuses the write"},
    {"file": "src/server/exit-routes.js", "at": "if (b.replaces) { try { old = hosts.get(String(b.replaces)); } catch { old = null; } }", "n": 1, "cls": "refuses", "why": "POST /api/hosts «Add it again with a key» (the train): the add itself refuses by name on the next line (hosts.add's first line) — nothing is replaced or removed", "bare": "the swallowed hold changes nothing: hosts.add refuses hosts-unread before any record is written, so no machine is replaced"},
    // 主开发 01:20Z (1): the callers of the methods that call get inside (device / deviceBounded / homeDir / the transcript fetches) — audit adv/hosts-callers-2.md
    {"file": "src/ctx-sync.js", "at": "const dm = await hosts.deviceBounded(hostId, connectMs);", "n": 1, "cls": "harmless", "why": "Cannot run while held: its only callers (task-groups-wiring scheduleCtxSync :165, the 60 s timer :175) take the host from hosts().get(), which throws, and skip. Nothing synced or written."},
    {"file": "src/exit-proxy.js", "at": "const dm = await this.hosts.deviceBounded(h.id, 8000); // throws if offline", "n": 1, "cls": "harmless", "why": "Cannot run while held: _forward is reached only from use(), whose _judge (:530) returns hosts-unread first; the agent hears that refusal by name before any device call."},
    {"file": "src/exit-proxy.js", "at": "const d = await this.hosts.deviceBounded(h.id, 8000);", "n": 1, "cls": "harmless", "why": "Per connection on a forward's own SOCKS listener, which exists only after _forward reached the device; no device connects while held (the hold starts at construction)."},
    {"file": "src/exit-proxy.js", "at": "const dm = await this.hosts.deviceBounded(h.id, 8000);", "n": 1, "cls": "harmless", "why": "Cannot run while held: run() refuses at _judge (:694-695) with hosts-unread by name before the device is asked. Its catch rethrows a named offline/run_failed refusal."},
    {"file": "src/exit-proxy.js", "at": "dm = await this.hosts.deviceBounded(h.id, 8000);", "n": 1, "cls": "harmless", "why": "Cannot run while held: the pull/push transfer refuses at _judge (:876-877) with hosts-unread by name first. Its catch rethrows offline/transfer_failed."},
    {"file": "src/exit-proxy.js", "at": "try { const dm = await this.hosts.deviceBounded(hostId); await dm.unserveSocks(l.deviceSocksPort", "n": 1, "cls": "harmless", "why": "stop() returns at `if (!l)`: no live exit forward can exist while held (opening one needs the device link). If reached, the local forward is already closed first.", "bare": "empty catch: best-effort remote SOCKS stop after the local forward is gone; no record changes; never reached while held"},
    {"file": "src/machine-mounts.js", "at": "const dm = await this.hosts.deviceBounded(hostId, 10000);", "n": 3, "cls": "refuses", "why": "(1) mountPush (remount refuses at :623 first): dial reads false, the catch falls to the public base; then detectOS->_run's get throws hosts-unread, the token is revoked, the route answers 503. · (2) Cannot run while held: _run's own hosts.get (:238) throws hosts-unread before this line; the error goes up to mountPush/mountPull and the route answers 503 by name. · (3) Cannot run while held: _ensureRclone's first step _remoteHome->_run throws hosts-unread at :238 (its own get at :300 would too) before this line."},
    {"file": "src/machine-mounts.js", "at": "try { const dm = await this.hosts.deviceBounded(rec.hostId); await dm.reverseUnforward(rec.tunne", "n": 1, "cls": "harmless", "why": "Cannot run while held: _unmountPush is reached only from unmount() (remount, unpair go through it), which refuses a push mount by name while held (:650) before any revoke or drop.", "bare": "empty catch: best-effort device listener release after the revoke; never reached while held (:650 refuses first)"},
    {"file": "src/machine-mounts.js", "at": "const dm = await this.hosts.deviceBounded(hostId, 8000);", "n": 1, "cls": "harmless", "why": "Cannot run while held: _mountPullInner's hosts.get (:525) throws hosts-unread first; no record is pushed; the route answers 503 with the words."},
    {"file": "src/machine-mounts.js", "at": "const device = await this.hosts.deviceBounded(rec.hostId, 10000); // ssh: daemon over --stdio; d", "n": 1, "cls": "harmless", "why": "Cannot run while held: _up comes from mountPull (get :525), remount (:623 refuses), onMachineLinked (no link while held) or the 90 s sweep (skips !_online). If reached: rethrows, record kept."},
    {"file": "src/machine-mounts.js", "at": "this.hosts.deviceBounded(hostId, 8000)", "n": 1, "cls": "harmless", "why": "Reached only on a machine link (a dial-in is refused while held; server.js :1482 findByDeviceId throws, caught) or restore's linked list (empty: _online() is false while held)."},
    {"file": "src/machine-mounts.js", "at": "try { dm = await this.hosts.deviceBounded(rec.hostId); } catch { continue; }", "n": 1, "cls": "harmless", "why": "Not reached while held: the push loop skips the record when _online() is false (it is, while held). If reached, no verdict this sweep; the next 90 s sweep asks again.", "bare": "catch -> continue: no verdict, _pushDown untouched, nothing marked; the next sweep asks again"},
    {"file": "src/port-forward.js", "at": "const dm = await this.hosts.deviceBounded(hostId);", "n": 2, "cls": "refuses", "why": "(1) Reached only through probes that run after a device step succeeded (_start / detect), so not while held. A failed probe keeps the last protocol (probeHostPort) or marks it pending. · (2) GET machine ports -> detect() rejects with the hold's words; server.js :1161 answers 400 with those words. The 30 s watch sweep asks no remote while held (hosts.list() is [])."},
    {"file": "src/port-forward.js", "at": "await this.hosts.deviceBounded(rec.hostId, 8000); // remote: fail loud so the UI can say \"device", "n": 1, "cls": "waits", "why": "Boot restore/heal/link: record kept, rec.error = the words, relay proxy down; the 30 s heal sweep (5-min backoff) restarts it and republishes the kept name after the read. Routes: 400 + words."},
    {"file": "src/port-forward.js", "at": "openUpstream = async () => { const dm = await this.hosts.deviceBounded(rec.hostId, 8000); return", "n": 1, "cls": "harmless", "why": "Per-connection upstream of a live forward; the listener exists only after :533 reached the device, which cannot happen while held."},
    {"file": "src/remote-fs.js", "at": "try { return await this.hosts.deviceBounded(id, 5000); } catch { return null; }", "n": 1, "cls": "refuses", "why": "_dev() -> null sends each Files op to its ssh/sh rung, which calls _host(id) = hosts.get -> hosts-unread reaches the Files route by name. With dataPlaneOn off it is not even asked.", "bare": "catch -> null is safe: every null-taker falls to _run/_spawn/_host, whose hosts.get throws hosts-unread by name"},
    {"file": "src/routes/sessions.js", "at": "const dm = await hosts.device(null);", "n": 1, "cls": "harmless", "why": "device(null) is the local daemon: isLocal(null) returns before the store, so the hold cannot reach it."},
    {"file": "src/server/boot-restore.js", "at": "hosts.device(null).then(async (dm) => {", "n": 1, "cls": "harmless", "why": "device(null) is the local daemon (re-opening a local pipe session); the hold cannot reach it."},
    {"file": "src/server/browser-access.js", "at": "try { dm = await hosts.deviceBounded(hostId, connectMs); }", "n": 1, "cls": "harmless", "why": "Cannot run while held: deviceOf() refuses at :73 with host_unavailable carrying the hold's words (never 'not paired') before the device is asked. Its catch rethrows named."},
    {"file": "src/server/conversation-deliver.js", "at": "try { const host = hosts.get(hid); return host ? { reply: 'paired', host } : UNKNOWN; }", "n": 1, "cls": "waits", "why": "THE PAIRING READ of the deliver engine (B-2566's remainder, r1645): ONE function, three replies — a HELD list, no list or a read that failed any other way is «cannot say» (every caller keeps what it holds: the delivery's owner claim — the remote rung meets the hold by name, the stash keeps the message, never «not running» (H2) — and a wake held for the machine); only the store's own «host not found» is «gone»; every reader of a machine there asks it"},
    {"file": "src/server/conversation-deliver.js", "at": "const dm = await (hosts.deviceBounded ? hosts.deviceBounded(hid, 6000) : hosts.device(hid));", "n": 2, "cls": "harmless", "why": "Dead branch with the real store: HostManager always has deviceBounded, so hosts.device(hid) is never taken; if it were, the same catch and stash apply."},
    {"file": "src/server/conversation-deliver.js", "at": "try { const dm = await getHosts().deviceBounded(hid, 6000); st = await remoteStateOf(dm, cid, hid); }", "n": 1, "cls": "harmless", "why": "B-2566's remainder (r1277): the machine is ASKED about a held conversation only once its link is back; a held list reads as unknown here (linkOf), so the ask is unreachable while held; a refusal keeps the wake held"},
    {"file": "src/server/desktop-access.js", "at": "try { dm = await hosts.deviceBounded(hostId, connectMs); }", "n": 1, "cls": "harmless", "why": "Cannot run while held: deviceOf's notHeld() (:126) refuses with host_unavailable + the hold's words first, never unsupported-host (the app keeper's 'removed' code)."},
    {"file": "src/server/desktop-access.js", "at": "try { const dm = await hosts.deviceBounded(h.id, Math.min(connectMs, 3000)); return dm && dm.sta", "n": 1, "cls": "harmless", "why": "Not reached while held: handleIfConnected gets its host only from hosts.list() rows (empty while held), so no probe runs and no machine row is written.", "bare": "catch -> null: the picker row reads not connected for this probe only and is re-probed; never reached while held"},
    {"file": "src/server/goal-sync.js", "at": "hosts.fetchSessionJsonl(session.host, session.claudeSessionId).catch(() => {});", "n": 1, "cls": "harmless", "why": "Throttled background cache refresh: the hold rejects at get before the cache is touched; this pass tail-reads the cached file; the next turn (after 30 s) asks again."},
    {"file": "src/server/sysinfo-wiring.js", "at": "const dm = await hosts.deviceBounded(hostId, 6000);", "n": 2, "cls": "harmless", "why": "(1) Cannot run while held: remoteSysinfo's hosts.get (:90) throws hosts-unread first; the error propagates to the caller. · (2) Cannot run while held: remoteProcs' hosts.get (:121) throws hosts-unread first; the error propagates to the caller.", "bare": "catch -> ssh rung; never reached while held (:90 throws first) · catch -> ssh rung; never reached while held (:121 throws first)"},
    {"file": "src/server/sysinfo-wiring.js", "at": "try { dm = await hosts.deviceBounded(hostId, 6000); } catch { }", "n": 1, "cls": "harmless", "why": "Cannot run while held: signalProc's hosts.get (:157) throws hosts-unread first; no signal is sent.", "bare": "empty catch -> dm null -> ssh rung; never reached while held (:157 throws first)"},
    {"file": "src/server/task-groups-wiring.js", "at": "const home = await hosts().homeDir(h);", "n": 1, "cls": "harmless", "why": "Cannot run while held: syncRemoteGroupCtx gets its host only from hosts().get() (:165, :175), which throws and is skipped. homeDir itself never throws (null -> return)."},
    {"file": "src/server/usage-pool-engine.js", "at": "const dm = await hosts.device(null);", "n": 1, "cls": "harmless", "why": "device(null) is the local daemon (pools are local-only); the hold cannot reach it.", "bare": "empty catch: local-daemon failures only; the hold cannot reach device(null)"},
    {"file": "src/server/usage-pool-engine.js", "at": "const dm = await hosts.device(null); // device #0 — pools are local-only", "n": 1, "cls": "harmless", "why": "device(null) is the local daemon (pools are local-only); the hold cannot reach it."},
    {"file": "src/server/usage-pool-engine.js", "at": "try { if (hosts.get(k.slice(5))) return true; } catch { /* host_not_found: a machine the list READ gone */ }", "n": 1, "cls": "refuses", "why": "r3349, usageReadingKnownOf: asked only once hosts.held() is false — while held the per-machine form answers 'unconfirmed' first (its item said, the set-aside press refused machines_unread 503); a throw past that is host_not_found, a machine the list READ gone (not known).", "bare": "the catch is host_not_found only: held() was asked before it, so the hold never lands here as «gone»."},
    {"file": "src/server/usage-pool-engine.js", "at": "try { const h = hosts.get(k.slice(5)); const n = h && h.name; if (typeof n === 'string' && n && !n.includes('@')) return n; } catch { }", "n": 1, "cls": "harmless", "why": "r3349, usageReadingLabelOf: the For-you item's label only — asked once hosts.held() is false (held ⇒ «a paired machine»); no act rides it.", "bare": "a label falls to the engine's account label: no act, no absence read as gone."},
    {"file": "src/spawn/dial.js", "at": "const dm = await hosts.device(h.id); // dial → deviceForDial", "n": 1, "cls": "harmless", "why": "Cannot run while held: the dial ladder's host comes from ws-create :1468/:1439 hosts.get, which ends the create with hosts-unread by name before the ladder runs."},
    {"file": "src/spawn/dial.js", "at": "try { const dm = typeof hosts.device === 'function' ? await hosts.device(h.id) : null; return dm ? helloOf(dm) : null; } catch { return null; }", "n": 1, "cls": "harmless", "why": "B-460d's remainder: the create's device hello when the cached handle is not linked — the same dial ladder as deviceAgentSetup's call: it cannot run while held (ws-create's hosts.get ends that create with hosts-unread by name first); a refusal reads as no hello, the release's spec.", "bare": "a refused or offline device reads as no hello: the release's spec and today's fact, never a start lost (the bridge then names an offline device)"},
    {"file": "src/transcript-service.js", "at": "const dm = await hosts.deviceBounded(r.host, 6000);", "n": 2, "cls": "refuses", "why": "(1) catch -> undefined: the read falls to the cached copy (read-only), where refreshRemote meets the hold too. Nothing written; logged once a minute; the next read asks again. · (2) picture() answers {unavailable: true, why: the words}: a transient answer, never {gone} or {unknown}; the page can ask again."},
    {"file": "src/transcript-service.js", "at": "await hosts.fetchTranscript(r.host, r.backend || 'claude', r.sessionId); // descriptor store.rem", "n": 1, "cls": "harmless", "why": "Returns the hold's words, never throws: gapInfo passes the words to the route as hostFetchError; view/taskState drop the words and read the cache. The cache is untouched (get throws first)."},
    {"file": "src/usage-routes.js", "at": "const dm = await hosts.device(hid);", "n": 2, "cls": "harmless", "why": "(1) Cannot run while held: the route's hosts.get (:977) answers 503 hosts-unread first, before the device leg. · (2) Cannot run while held: the route's hosts.get (:1031) answers 503 hosts-unread first, before the device leg."},
    {"file": "src/writer-sweep.js", "at": "const dm = await hosts.deviceBounded(hostId, connectMs);", "n": 1, "cls": "harmless", "why": "Remote callers (spawn/ssh.js :302, spawn/dial.js :286) run only after ws-create's get refused the create; spawn/local.js passes null (local). If reached it rethrows hosts-unread."},
    {"file": "src/ws-create.js", "at": "const dm = await hosts.device(null);", "n": 1, "cls": "harmless", "why": "device(null) is the local daemon (the R6 local pipe session); the hold cannot reach it."},
    {"file": "src/ws-handler.js", "at": "{ const ks = activeSessions.get(data.sessionId); if (ks && ks._bridgePort) { try { dialBridge?.c", "n": 1, "cls": "harmless", "why": "Kill of a restored dial pty session (_dialReversePort from meta): the kill proceeds; only the best-effort release of the device-side back-tunnel port is skipped, as for an offline device.", "bare": ".catch(() => {}) safe: best-effort cleanup only; no record, link or session state is dropped by it"},
    {"file": "src/ws-handler.js", "at": "hosts.deviceBounded(session.host, 8000).then(async (dm) => {", "n": 1, "cls": "waits", "why": "remoteStop does not run while held: notifyKillHeld says so by name and hosts.whenRead runs it once the machines read (in memory: a restart before then forgets it, said in the log).", "bare": "the enclosing try's empty catch would eat get's hosts-unread, but remoteStop never runs while held (whenRead defers it)"},
    {"file": "src/ws-handler.js", "at": "try { hosts.device(null).then((dm) => dm.killPipeSession(session.keeperSid)).catch(() => { }); }", "n": 1, "cls": "harmless", "why": "device(null) is the local daemon (kill of a local pipe session); the hold cannot reach it.", "bare": ".catch(() => {}) + catch {}: local-daemon failures only; the hold cannot reach device(null)"},
    {"file": "src/ws-handler.js", "at": "const p = await hosts.fetchAgentJsonl(String(subHost), agentId, { claudeSessionId: claudeId });", "n": 1, "cls": "refuses", "why": "catch keeps the words as subFetchErr; an empty log is sent with loadError 'Couldn't load this agent's log from the machine: <words>'; a local cached copy shows if present."},
    {"file": "src/ws-handler.js", "at": "await hosts.fetchTranscript(session.host, session.backend || 'claude', rid); // the harness's st", "n": 1, "cls": "harmless", "why": "catch logs; the attach builds history from the cached copy + buffer; nothing written. Caveat: rebuildHistory then sets _historyLoaded, so this live session is not re-fetched until a restart."},
    {"file": "src/ws-handler.js", "at": "await hosts.fetchTranscript(data.host, data.backend || 'claude', backendSessionId); // the harne", "n": 1, "cls": "harmless", "why": "View-only open: catch logs and the stale cache is read (stale beats none); read-only, nothing written; the next open asks again."},
    // lane lg-remote-hardening's move onto the stores chain (d17441191): its callers — the host-key and device-key doors, the hub's own key
    {"file": "src/hosts.js", "at": "if (this.get(id).deviceId) throw Object.assign(new Error('this machine already dials out", "n": 1, "cls": "refuses", "why": "notDialOut (lane lg-remote-hardening): the upgrade's first statement — get throws hosts-unread by name while held, before anything runs"},
    {"file": "src/hosts.js", "at": "devicePin: () => { try { const k = this.get(id).deviceKey;", "n": 3, "cls": "harmless", "why": "the ssh road's DeviceManager options (lane lg-remote-hardening: devicePin / deviceProofRequired / deviceJudged) — unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial)", "bare": "built only after get(id) answered; unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial)"},
    {"file": "src/hosts.js", "at": "const h0 = this.get(id);", "n": 2, "cls": "refuses", "why": "pinHostKeys and pinKnownHostKeys (B-7f0b, r1220 (2): the one-press pin) (lane lg-remote-hardening): get throws hosts-unread by name while held, before anything is scanned or written (its route answers 503)"},
    {"file": "src/server/dial-pairing.js", "at": "{ const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteDeviceKey?.(h.id, 'refused-again'", "n": 1, "cls": "harmless", "why": "a dialed stream's key refusal said again (lane lg-remote-hardening) — unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial)", "bare": "unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial); a broadcast that fails changes no record"},
    {"file": "src/server/dial-pairing.js", "at": "const recK = hosts.findByDeviceId(deviceId) || {};", "n": 1, "cls": "harmless", "why": "deviceForDial's record of the device key (lane lg-remote-hardening) — unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial)"},
    {"file": "src/server/dial-pairing.js", "at": "devicePin: () => { const h = hosts.findByDeviceId(deviceId); const k = h && h.deviceKey;", "n": 2, "cls": "harmless", "why": "deviceForDial DeviceManager hooks (lane lg-remote-hardening: devicePin / deviceProofRequired) — unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial)"},
    {"file": "src/server/dial-pairing.js", "at": "onDeviceKey: (ev, f) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteDeviceKey?.(", "n": 1, "cls": "harmless", "why": "a dialed-in device's key learned / refused (lane lg-remote-hardening) — unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial)", "bare": "unreachable while held: the hold begins only at the boot's read, and no link is built while held (every connect meets get / findByDeviceId first; every dial is held off — holdDial); a broadcast that fails changes no record"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "anyHubPin: () => (hosts.held() ? true : hosts.list().filter((h) => !!h.hubPinned)", "n": 1, "cls": "refuses", "why": "anyHubPin (lane lg-remote-hardening): a HELD list counts as a pin (true: host-tokens' boolean «a pin exists», never an empty list) — this hub's own key is never minted anew in silence while the machines are unread (hub_identity_lost by name)"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "let h = null; try { h = hosts.get(req.params.id); } catch (e) { if (e && e.code === 'hosts-unread') return res.status(503)", "n": 1, "cls": "refuses", "why": "DELETE /api/hosts/:id/hub-pin (lane lg-remote-hardening): 503 hosts-unread by name while held — never «no such machine»"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "for (const row of hosts.list()) {", "n": 1, "cls": "refuses", "why": "POST /api/hosts/hub-identity/renew (lane lg-remote-hardening): refused 503 hosts-unread before the new key is made (hosts.held()) — a key renewed over an unread list would clear no pin and cannot be undone"},
    {"file": "src/server/mounts-plugins-wiring.js", "at": "const h = hosts.get(row.id);", "n": 1, "cls": "refuses", "why": "the renew's loop — refused before it while held (hosts.held())"},
    {"file": "src/server/exit-routes.js", "at": "const h = hosts.get(req.params.id);", "n": 1, "cls": "refuses", "why": "GET /api/hosts/:id/host-keys (lane lg-remote-hardening): get throws hosts-unread while held — hostKeyFail answers 503 by name, the page words it by its code"},
  ];
  const SITE = /\b(?:hosts|_hosts|getHosts)(?:\?\.)?(?:\(\))?\??\.(?:get|list|findByDeviceId|device|deviceBounded|homeDir|fetchTranscript|fetchSessionJsonl|fetchCodexJsonl|fetchAgentJsonl)\??\.?\(/g, SELF = /\bthis\.(?:get|list|findByDeviceId)\(/g;
  const siteOf = (file, ln) => (ln.match(SITE) || []).length + (file === 'src/hosts.js' ? (ln.match(SELF) || []).length : 0);
  const SF = serverFiles();
  const c = census(SF, ROWS, { siteOf });
  const total = c.sites.reduce((k, s) => k + s.n, 0);
  ok(total >= 130 && SF.size > 300, `the census sees the callers (${total} lookups on ${c.sites.length} lines over ${SF.size} server files)`, total);
  ok(!c.unrowed.length, `every caller of a lookup is a row (${ROWS.length} rows) — a new caller: classify it (waits / refuses / harmless / not-hosts), then add its row`, c.unrowed);
  ok(!c.moved.length && !c.dead.length, 'no row moved (a new lookup on a known line) and none is dead', { moved: c.moved, dead: c.dead });
  ok(!c.bare.length, 'no catch swallows a lookup unless its row says why (`bare`) — the catch on its line, or the one of the innermost multi-line try around it', c.bare);
  ok(!c.unparsed.length, 'every file with a lookup parses (acorn) — the try around each lookup is judged, never skipped', c.unparsed);
  ok(!c.staleBare.length, 'no row says why of a catch that is no longer there', c.staleBare);
  ok(ROWS.every((r) => CLASSES.includes(r.cls) && typeof r.why === 'string' && r.why.length > 8 && !/—\s*—|—\s*$/.test(r.why)), 'every row has a class and its why (its read r2, N11: never a placeholder)', ROWS.filter((r) => !CLASSES.includes(r.cls) || !r.why).map((r) => `${r.file} «${r.at}»`));
  // CONTROLS — a new caller, a row cut, a swallowing catch planted on a known line
  const P1 = new Map(SF); P1.set('src/server/a-new-reader.js', "const h = hosts.get(id);\n");
  ok(census(P1, ROWS, { siteOf }).unrowed.length === 1, 'CONTROL: a new caller with no row is RED');
  const P1d = new Map(SF); P1d.set('src/server/a-new-device-reader.js', "const dm = await hosts.deviceBounded(id).catch(() => null);\n");
  ok(census(P1d, ROWS, { siteOf }).unrowed.length === 1, 'CONTROL (主开发 01:20Z (1)): a new caller of a method that calls get inside (deviceBounded) with no row is RED');
  ok(census(SF, ROWS.filter((r) => r.file !== 'src/server/exit-routes.js'), { siteOf }).unrowed.length >= 5, 'CONTROL: the exit routes\' rows cut — their callers are unrowed (RED)');
  const plain = ROWS.find((r) => !r.bare && r.n === 1 && c.sites.some((x) => x.row === r && !x.bare));   // a row judged clean today
  const P3 = new Map(SF); P3.set(plain.file, SF.get(plain.file).replace(plain.at, plain.at + ' try { hosts.list(); } catch { }'));
  const c3 = census(P3, ROWS, { siteOf });
  ok(c3.bare.length === 1 && c3.moved.length === 1, 'CONTROL: a swallowing catch planted around a lookup on a known line is RED (and its count moved)', { bare: c3.bare, moved: c3.moved });
  const PR0 = { file: 'src/server/an-unparsed-reader.js', at: 'const h = hosts.get(id);', n: 1, cls: 'harmless', why: 'a planted reader (the control)' };
  // its read r2 (N12): a file with a lookup that acorn cannot parse is RED (never skipped)
  const P6 = new Map(SF); P6.set(PR0.file, 'function f(id) { const h = hosts.get(id); <<< not js >>>\n');
  ok(census(P6, [...ROWS, PR0], { siteOf }).unparsed.includes(PR0.file), 'CONTROL: a file with a lookup that does not parse is RED (its try cannot be judged)');
  // its read S4: a lookup deep in a MULTI-LINE try whose catch swallows is seen (the catch lines below it); the same lookup bare of a try is not
  const PR = { file: 'src/server/a-tried-reader.js', at: 'const h = hosts.get(id);', n: 1, cls: 'harmless', why: 'a planted reader (the control)' };
  const P4 = new Map(SF); P4.set(PR.file, 'function f(id) {\n  try {\n    const h = hosts.get(id);\n    use(h);\n    more(h);\n  } catch { return null; }\n}\n');
  const P5 = new Map(SF); P5.set(PR.file, 'function f(id) {\n  const h = hosts.get(id);\n  use(h);\n}\n');
  const c4 = census(P4, [...ROWS, PR], { siteOf }), c5 = census(P5, [...ROWS, PR], { siteOf });
  ok(c4.bare.some((b) => b.includes('a-tried-reader')) && !c5.bare.some((b) => b.includes('a-tried-reader')), 'CONTROL (its read S4): a lookup inside a multi-line try whose catch returns null is RED without its why; the same lookup outside a try is not', { c4: c4.bare, c5: c5.bare });
}

// ── §0 a lookup while held answers ONE reply — «unknown, by name» ───────────────────────────────────────────────────────────────
console.log('§0 get / findByDeviceId / list while held: «unknown, by name», never «absent»');
{
  const HSRC = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const FIND = "    if (this._unread) throw this._heldError();\n    // Pure-dial first";
  ok(HSRC.split(FIND).length === 2, 'control setup: the anchor of the control «is it paired says held» is in hosts.js');
  const held = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; heldBy(H); return H; };
  const codeOf = (fn) => { try { const v = fn(); return v === null || v === undefined ? 'absent' : 'answered'; } catch (e) { return e && e.code; } };
  const H = held(require(path.join(ROOT, 'src/hosts.js')));
  const l = H.list();
  ok(codeOf(() => H.get('h-0001')) === 'hosts-unread' && codeOf(() => H.findByDeviceId('dev-0001')) === 'hosts-unread' && codeOf(() => H.dialTokenHash('dev-0001')) === 'hosts-unread',
    'get, findByDeviceId («is it paired») and dialTokenHash throw hosts-unread (503, the hold\'s words) while held');
  ok(Array.isArray(l) && l.length === 0 && typeof l.held === 'string' && /could not be read/.test(l.held) && JSON.stringify(l) === '[]' && H.held() === true,
    'list() while held is empty AND carries the hold\'s words (`held`, not enumerated: the JSON is unchanged); held() says so', { held: l.held });
  const HX = held(MJ.load('src/hosts.js', anchored(HSRC, FIND, '    // Pure-dial first', 'hhc-311a'), 'find-no-held'));
  ok(codeOf(() => HX.findByDeviceId('dev-0001')) === 'absent', 'CONTROL (findByDeviceId\'s held line cut, in a copy): «is it paired» answers ABSENT on a held list');
}

// ── §2 the page reads the hold (client) ────────────────────────────────────────────────────────────────────────────────────────
console.log('§2 the page reads the hold — a list that arrives with the hold\'s mark is never cached as a roster');
{
  const WB = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-workbench.js'), 'utf8');
  const slice = (src, head) => { const i = src.indexOf(head); if (i < 0) return null; const j = src.indexOf('\n    },\n', i); return j < 0 ? null : src.slice(i, j + 7); };   // through the method's comma
  const HELDLINE = "        if (d.unread) { const first = !this._hostsHeld; this._hostsHeld = true; this._hostsDataFailAt = Date.now(); if (first) this._render(); return; }";
  ok(WB.split(HELDLINE).length === 2, 'control setup: the anchor of the control «a held list is no roster» is in sidebar-workbench.js');
  const sidebarOf = (src) => {
    const a = slice(src, '    _ensureHostsData() {'), b = slice(src, '    _wbValidHost(id, storageKey, memKey) {');
    if (!a || !b) return null;
    const store = new Map(), toasts = [];
    let reply = null;
    const fetchStub = async () => ({ json: async () => reply });
    const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    // eslint-disable-next-line no-new-func
    const obj = new Function('fetch', 'localStorage', 'showToast', 'tr', `return {\n${a}\n${b}\n  _render() { this._renders = (this._renders || 0) + 1; }\n};`)(fetchStub, ls, (m) => toasts.push(m), (s) => s);
    return { obj, store, toasts, answer: (r) => { reply = r; } };
  };
  const scene = async (src, rep) => {
    const S = sidebarOf(src); if (!S) return null;
    S.store.set('wbRecentHost', 'h-0001'); S.obj._wbRecentHost = 'h-0001';
    S.answer(rep);
    S.obj._ensureHostsData();
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const kept = S.obj._wbValidHost('h-0001', 'wbRecentHost', '_wbRecentHost');
    return { cached: Array.isArray(S.obj._hostsData && S.obj._hostsData.hosts), held: !!S.obj._hostsHeld, kept, stored: S.store.get('wbRecentHost'), toasts: S.toasts.length, renders: S.obj._renders || 0 };
  };
  const HELD = { hosts: [], key: { exists: false }, unread: 'hosts.json in VibeSpace\'s data folder could not be read (EACCES)' };
  const GONE = { hosts: [], key: { exists: false } };
  const h = await scene(WB, HELD), g = await scene(WB, GONE);
  const hx = await scene(WB.replace(HELDLINE, '        /* MUTANT: a held list cached as the roster */'), HELD);
  ok(h && !h.cached && h.held && h.kept === 'h-0001' && h.stored === 'h-0001' && h.toasts === 0,
    'a HELD machines list is not cached: the person\'s Recent machine pick is KEPT (in memory and stored), no «no longer exists» toast', h);
  ok(g && g.cached && g.kept === '' && g.stored === '' && g.toasts === 1, 'the plant: a list READ empty (the machine really removed) still heals the pick back to Local, once, said', g);
  ok(hx && hx.cached && hx.kept === '' && hx.stored === '' && hx.toasts === 1, 'CONTROL (the held check cut, in the source): the held list is cached — the pick is wiped and «no longer exists» is toasted', hx);
  // 主开发 01:20Z (2): the Recent / History switcher SAYS the hold (it used to just vanish): the first held answer draws once (the
  // row under Recent's head says it), a second draws nothing new, and the list read at last draws again (the row goes)
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
  const lift = async (src) => {
    const S = sidebarOf(src); if (!S) return null;
    S.answer(HELD); S.obj._ensureHostsData(); await settle();
    const r1 = S.obj._renders || 0; S.obj._hostsDataFailAt = 0;
    S.obj._ensureHostsData(); await settle();
    const r2 = S.obj._renders || 0; S.obj._hostsDataFailAt = 0;
    S.answer(GONE); S.obj._ensureHostsData(); await settle();
    return { r1, r2, r3: S.obj._renders || 0, held: !!S.obj._hostsHeld };
  };
  const DRAW = ' if (first) this._render();', LIFTED = ' || wasHeld) this._render();';
  ok(HELDLINE.includes(DRAW) && WB.split(LIFTED).length === 2, 'control setup: the two draws (the hold seen, the hold lifted) are found once');
  const L = await lift(WB), LA = await lift(WB.replace(HELDLINE, HELDLINE.replace(DRAW, ''))), LB = await lift(WB.replace(LIFTED, ') this._render();'));
  ok(L && L.r1 === 1 && L.r2 === 1 && L.r3 === 2 && !L.held, 'the switcher SAYS the hold: drawn once when the held list arrives (not again for a second one), drawn again when the list reads (the row goes)', L);
  ok(LA && LA.r1 === 0 && LB && LB.r3 === LB.r2, 'CONTROLS: without the first draw the held page shows nothing until something else draws; without the lifted draw the row stays after the list reads (no pick to draw for) — each RED', { LA, LB });
  const ROWLINE = "      if (this._hostsHeld && !(this._hostsData?.hosts || []).length) { const e = document.createElement('div'); e.className = 'wb-empty wb-hosts-held'; e.textContent = tr('Your paired machines cannot be read right now — nothing is lost; they come back here when they read.'); this.listEl.appendChild(e); }";
  const HEADLINE = 'this.listEl.appendChild(this._buildRecentHead(recentHost, recent.length, zoneHead));';
  ok(WB.split(ROWLINE).length === 2 && WB.indexOf(ROWLINE) > WB.indexOf(HEADLINE) && WB.indexOf(ROWLINE) - WB.indexOf(HEADLINE) < 400,
    'the Recent zone draws ONE row saying the hold, right under its head, in the words the toolbar\'s machine menu says it (zh / ja rows)');
}

// ── §3 a conversation on a paired machine while the list is held: its owner claim stands («unknown», never «gone») ─────────────
console.log('§3 a message to a conversation on a paired machine is never told «not running» while the machines are held');
{
  const HSRC = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const KEEP = '(hid) => { if (this._unread) return true; try { return !!this.get(hid); } catch { return false; } }';
  ok(HSRC.split(KEEP).length === 2, 'control setup: the anchor of the control «a held list keeps the owner claim» is in hosts.js');
  const idx = { ownerHost(sid, isReg) { const claims = ['h-gone', 'h-0001'].filter((h) => isReg(h)); return claims.length === 1 ? claims[0] : null; } };
  const ownerOf = (Mod, { held }) => {
    const H = Object.create(Mod.HostManager.prototype);
    H._state = { hosts: held ? [] : [{ id: 'h-0001', name: 'build box', transport: 'dial', deviceId: 'dev-0001' }] };
    if (held) heldBy(H);
    H.convIndex = idx;
    return H.conversationOwner('conv-1');
  };
  const live = ownerOf(require(path.join(ROOT, 'src/hosts.js')), { held: false });
  ok(live === 'h-0001', 'a removed machine\'s old claim is FILTERED (one live claim answers — it made the whole answer null: ALSO CURED)', live);
  // while held, BOTH claims stand (the index cannot be judged) ⇒ ambiguous here by the stub's rule; a single claim answers itself
  const one = { ownerHost(sid, isReg) { return isReg('h-0001') ? 'h-0001' : null; } };
  const heldOwner = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; heldBy(H); H.convIndex = one; return H.conversationOwner('conv-1'); };
  const h = heldOwner(require(path.join(ROOT, 'src/hosts.js')));
  const hx = heldOwner(MJ.load('src/hosts.js', anchored(HSRC, KEEP, '(hid) => !!this.get(hid)', 'hhc-393a'), 'owner-no-held'));   // stale-pins: kept (the control plants the release's text in a copy)
  ok(h === 'h-0001' && hx === null, 'hosts.conversationOwner on a HELD list keeps the conversation\'s claim; CONTROL (the release\'s filter, in a copy): null — the conversation reads as on no machine', { h, hx });

  const CD = fs.readFileSync(path.join(ROOT, 'src/server/conversation-deliver.js'), 'utf8');
  // B-2566's remainder (r1645): ownerHostOf asks THE PAIRING READ (pairingOf) — sliced together, run over a HELD store
  const slice = (head) => { const i = CD.indexOf(head), j = i < 0 ? -1 : CD.indexOf('\n  }\n', i); return i < 0 || j < 0 ? null : CD.slice(i, j + 4); };
  const pair = slice('  function pairingOf(hid) {\n'), fn = slice('  function ownerHostOf(cid) {\n');
  const HELD_READ = "    try { if (typeof hosts.held === 'function' && hosts.held()) return UNKNOWN; } catch { return UNKNOWN; }";
  const CATCH = "    catch (e) { return e && e.code === 'host_not_found' ? { reply: 'gone' } : UNKNOWN; }";
  ok(!!pair && !!fn && pair.includes(HELD_READ) && pair.includes(CATCH) && fn.includes("idx.ownerHost(cid, (id) => pairingOf(id).reply !== 'gone')"), 'control setup: pairingOf and ownerHostOf are sliced from conversation-deliver.js — the held read, the store\'s own «gone», the claim asked of it (the control\'s anchors)');
  const ownerHostOf = (pairSrc) => {
    const hosts = { held: () => true, get: () => { throw Object.assign(new Error('hosts.json could not be read (EACCES)'), { code: 'hosts-unread', status: 503 }); } };
    // eslint-disable-next-line no-new-func
    return new Function('getHosts', 'getConvIndex', `${pairSrc}\n${fn}\nreturn ownerHostOf;`)(() => hosts, () => one);
  };
  const d = pair && fn && ownerHostOf(pair)('conv-1');
  const dx = pair && fn && ownerHostOf(pair.replace(HELD_READ, "    try { if (typeof hosts.held === 'function' && hosts.held()) return { reply: 'gone' }; } catch { return UNKNOWN; }").replace(CATCH, "    catch { return { reply: 'gone' }; }"))('conv-1');
  ok(d === 'h-0001' && dx === null, 'the delivery\'s owner question on a HELD list answers the conversation\'s machine (the remote rung meets the hold by name, the stash keeps the message); CONTROL (the held read answering «gone», in the slice): null — the local rung\'s miss says «no live inbox … not running»', { d, dx });
}

// ── §4 the page's readers of GET /api/hosts — each a row; its PIN is the line that reads the hold's mark (or why none is needed) ──
console.log('§4 every page reader of the machines list is a row');
{
  const CLIENT = [
    { file: 'src/lib/app.js', at: "fetchJson('/api/hosts').then(d => {", n: 1, cls: 'waits', pin: 'if (d && d.unread) for (const id of new Set([hostId, was].filter(Boolean)))', why: 'New Session: a held list keeps the machine this open names (and the pick) as an option worded unread — never a silent This machine; the create meets the hold by name' },
    { file: 'src/lib/app.js', at: "const d = await fetchJson('/api/hosts'); for (const h of d?.hosts || []) this._hostNames[h.id] = h.name;", n: 1, cls: 'harmless', pin: "if (m.type === 'hosts-updated' || m.type === 'user-state-updated') this._hostNames = null;", why: 'display names only (an id shows meanwhile); the lift broadcasts hosts-updated, which drops the map' },
    { file: 'src/lib/file-explorer.js', at: "const r = await fetch('/api/hosts');", n: 1, cls: 'harmless', pin: 'this._hostSelect.value = cur;', why: 'the explorer keeps the machine it browses (its value is set back, never reset to Local); names fall back to ids' },
    { file: 'src/lib/manage-agents.js', at: "run: async () => { const hd = await fetchJson('/api/hosts'); if (hd && hd.key)", n: 1, cls: 'harmless', pin: "if (hd && hd.key) { sayOnLine(noneLine, ''); sbHost._showAddHostDialog(hd); return; }", why: 'the Add-an-SSH-machine door (lane ui-needs-a-button) reads only the hub\'s own ssh key (`key`, answered while held too) to open the form — the add itself is refused by name while the list is held (hosts.add\'s first line)' },
    { file: 'src/lib/manage-agents.js', at: "const hd = await fetchJson('/api/hosts'); hostsList = hd?.hosts || []; hostsHeld", n: 1, cls: 'refuses', pin: "            : needLine({ words: t('VibeSpace cannot read its paired machines right now", why: 'the Machines tab says the hold, never «No machines yet»' },
    { file: 'src/lib/path-field.js', at: "HOSTS.p = fetchJson('/api/hosts')", n: 1, cls: 'harmless', pin: 'if (d && d.unread) { HOSTS.heldAt = Date.now(); HOSTS.p = null; return; }', why: 'names only — a held answer is not kept, asked again 30 s later' },
    { file: 'src/lib/settings-ui.js', at: "const hd = await fetchJson('/api/hosts');", n: 1, cls: 'refuses', pin: "if (hd && hd.unread) { addLine({ tone: 'dim', text: t('VibeSpace cannot read its paired machines right now", why: 'Settings\' machine check says the hold, never «No other machines registered»' },
    { file: 'src/lib/sidebar-mounts.js', at: "api('/api/hosts'), api('/api/mount-tokens')", n: 1, cls: 'refuses', pin: 'if (!hostsHeld) this._hostsData = hd;', why: 'the Machines panel says why it is empty, the held list is never the cached roster, no mount reads as «on a removed machine»' },
    { file: 'src/lib/sidebar-mounts.js', at: "const hd = await api('/api/hosts'); hosts = hd.hosts || []; held = !!hd.unread;", n: 1, cls: 'refuses', pin: "if (held) { showToast(tr('VibeSpace cannot read its paired machines right now", why: 'the mount-onto picker says the hold, never «No remote machines yet»' },
    { file: 'src/lib/sidebar-mounts.js', at: "r = await api('/api/hosts', {", n: 1, cls: 'refuses', pin: "error: (KEY_ERR[e.code] || (() => e.message))(),", why: 'Add machine (a POST): the server refuses 503 hosts-unread and its words are shown' },
    { file: 'src/lib/sidebar-rail.js', at: "fetchJson('/api/port-forwards'), fetchJson('/api/hosts')", n: 1, cls: 'harmless', pin: "this._railSetBadge('mounts', off ? off + '⏻' : '');", why: 'a badge count of offline devices — no badge while held; nothing is changed' },
    { file: 'src/lib/sidebar-rail.js', at: "hostsList = (await fetchJson('/api/hosts'))?.hosts || [];", n: 1, cls: 'harmless', pin: "if (!c.isConnected) return;", why: 'the System panel\'s machine chooser lists this machine only until it is opened again' },
    { file: 'src/lib/sidebar-rail.js', at: "hosts = ((await api('/api/hosts')) || {}).hosts || [];", n: 1, cls: 'harmless', pin: "const machines = [{ id: '__local__', name: tr('This machine'), online: true },", why: 'the publish dialog offers This machine only; nothing on a machine it does not list is changed' },
    { file: 'src/lib/sidebar-tasks.js', at: "let d = null; try { d = await fetchJson('/api/hosts'); } catch { d = null; }", n: 1, cls: 'refuses', pin: 'const unread = !d || d.error || d.unread || !Array.isArray(d.hosts);', why: 'B-06de\'s group door (a first folder on another machine): a held list refuses in its own words («cannot be read right now»), never «not paired any more» — nothing is opened (§5b drives it)' },
    { file: 'src/lib/task-detail.js', at: "fetchJson('/api/hosts').then((d) => {", n: 1, cls: 'waits', pin: 'if (closed || !d || d.unread || !Array.isArray(d.hosts)) return;', why: 'B-06de\'s group window re-reads the machines list: a held answer is never the roster (the table keeps what it said; asked again on the next paint — §5b drives it)' },
    { file: 'src/lib/sidebar-workbench.js', at: "fetch('/api/hosts').then(r => r.json()).then(d => {", n: 1, cls: 'waits', pin: 'if (d.unread) { const first = !this._hostsHeld; this._hostsHeld = true; this._hostsDataFailAt = Date.now(); if (first) this._render(); return; }', why: 'Recent / History machine picks: a held list is never the roster (kept, no «no longer exists»); asked again after the backoff (§2 drives it)' },
    { file: 'src/lib/toolbar-fold.js', at: "const d = await fetchJson('/api/hosts'); hostsList = d?.hosts || []; held = (d && d.unread) || null;", n: 1, cls: 'refuses', pin: '...(held ? [{ caption: t(\'Your paired machines cannot be read right now', why: 'the terminal button opens its menu with the hold\'s words — never a local shell in place of the machine meant' },
    { file: 'src/lib/sidebar-mounts.js', at: "h = ((await api('/api/hosts')).hosts || []).find((x) => x.id === h.id) || h;", n: 1, cls: 'refuses', pin: "if (e && e.code === 'hosts-unread') return hostsHeldWords();", why: 'the Host key dialog (lane lg-remote-hardening) reads the machine\'s whole record; while held the list is empty, the record stays partial and the host-keys route refuses 503 hosts-unread — worded by its code (hostKeyErrorWords → hostsHeldWords), never «no key»' },
  ];
  // its read N4: every quote — single, double, a template
  const clientSite = (file, ln) => ["'", '"', '`'].reduce((k, q) => k + (ln.split(`${q}/api/hosts${q})`).length - 1) + (ln.split(`${q}/api/hosts${q}, {`).length - 1), 0);
  const clientFiles = () => new Map(fs.readdirSync(path.join(ROOT, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => ['src/lib/' + f, fs.readFileSync(path.join(ROOT, 'src/lib', f), 'utf8')]));
  const CF = clientFiles();
  const c = census(CF, CLIENT, { siteOf: clientSite, bareRule: false });
  ok(c.sites.length >= 14, `the client census sees the readers (${c.sites.length} sites over ${CF.size} files)`, c.sites.length);
  ok(!c.unrowed.length, `every page reader of GET /api/hosts is a row (${CLIENT.length} rows)`, c.unrowed);
  ok(!c.moved.length && !c.dead.length, 'no client row moved or dead', { moved: c.moved, dead: c.dead });
  ok(CLIENT.every((r) => CLASSES.includes(r.cls) && r.why && (CF.get(r.file) || '').includes(r.pin)), 'every client row has its class, its why, and its PIN in its file', CLIENT.filter((r) => !(CF.get(r.file) || '').includes(r.pin)).map((r) => `${r.file} «${r.pin.slice(0, 60)}»`));
  // CONTROLS — a new reader with no row is red; a pin cut is red
  const planted = new Map(CF); planted.set('src/lib/new-reader.js', "const d = await fetchJson('/api/hosts');\n");
  ok(census(planted, CLIENT, { siteOf: clientSite, bareRule: false }).unrowed.length === 1, 'CONTROL: a new page reader of the machines list with no row is RED');
  const S2 = new Map(CF); S2.set('src/lib/settings-ui.js', CF.get('src/lib/settings-ui.js').replace('if (hd && hd.unread) {', 'if (false) {'));
  ok(CLIENT.some((r) => !(S2.get(r.file) || '').includes(r.pin)), 'CONTROL: Settings\' read of the hold cut — its row\'s PIN is missing (red)');
}

// ── §5 the cures' behaviour while held, each against a copy that cuts it ────────────────────────────────────────────────────────
console.log('§5 the readers that named an absence now say the hold');
{
  const WORDS = 'hosts.json in VibeSpace\'s data folder could not be read (EACCES)';
  const heldErr = () => Object.assign(new Error(WORDS), { code: 'hosts-unread', status: 503 });
  const heldHosts = { held: () => true, unreadWords: () => WORDS, get: () => { throw heldErr(); }, list: () => Object.defineProperty([], 'held', { value: WORDS }), findByDeviceId: () => { throw heldErr(); }, deviceBounded: async () => { throw heldErr(); }, dialOnline: () => false };
  const codeOf = async (fn) => { try { await fn(); return 'answered'; } catch (e) { return (e && e.code) || 'threw'; } };
  // (a) exit-proxy: the owner's dialog (view), the hub-act «Always» (setAccess) and the agent's verbs (listFor / _judge) — H17 / H23
  const XSRC = fs.readFileSync(path.join(ROOT, 'src/exit-proxy.js'), 'utf8');
  const RH = "  _refuseIfHeld() { if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) throw namedError('hosts-unread', this.hosts.unreadWords()); }";
  const JH = "    if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) return { refusal: { code: 'hosts-unread', error: this.hosts.unreadWords() } };\n";
  ok(XSRC.split(RH).length === 2 && XSRC.split(JH).length === 2, 'control setup: the anchors of the exit controls are in exit-proxy.js');
  const exitScene = async (Mod) => {
    // its read N8: the grants hold a machine's row, so a prune over the held (empty) list WOULD clear it — the belt is what stops it
    const X = new Mod.ExitProxyManager({ hosts: heldHosts, grants: { rowsFor: () => [], rowsOfDoor: () => [{ resource: 'h-0001:use', except: [] }], setMany: () => ({ ok: true }) } });
    return { view: await codeOf(() => X.view('h-0001')), set: await codeOf(() => X.setAccess('h-0001', { hub: { mode: 'everyone' } })), list: await codeOf(() => X.listFor(null, 's1')), judge: (() => { try { return (X._judge(null, 's1', 'gpu1', 'use').refusal || {}).code || 'none'; } catch (e) { return 'threw'; } })(), pruned: X.pruneLists() };
  };
  const ex = await exitScene(require(path.join(ROOT, 'src/exit-proxy.js')));
  const PB = "      if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) return 0;   // the B-f276 remainder's belt: a HELD list removed no machine\n";
  ok(XSRC.split(PB).length === 2, 'control setup: the anchor of the pruneLists belt is in exit-proxy.js');
  const exx = await exitScene(MJ.load('src/exit-proxy.js', anchored(anchored(anchored(XSRC, RH, '  _refuseIfHeld() { }', 'hhc-466a'), JH, '', 'hhc-466b'), PB, '', 'hhc-466c'), 'exit-no-held'));
  ok(ex.view === 'hosts-unread' && ex.set === 'hosts-unread' && ex.list === 'hosts-unread' && ex.judge === 'hosts-unread' && ex.pruned === 0,
    'exit access while held: the dialog, the «Always» and the agent\'s list / use / run are refused hosts-unread (503) — never «no such machine» / no_machine', ex);
  ok(exx.view === 'not-found' && exx.judge !== 'hosts-unread' && exx.pruned === 1, 'CONTROL (the held checks and the prune\'s belt cut, in a copy): «no such machine» and the agent\'s no_machine come back, and the prune clears the machine\'s exit list', exx);
  // (b) machine-mounts: a PUSH mount's removal while held is refused, the record and its token kept — H5
  const MSRC = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
  const UH = "    if (rec.dir !== 'pull' && this.hosts.held?.()) throw Object.assign(new Error(`removing a mount on a machine: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 });\n";
  ok(MSRC.split(UH).length === 2, 'control setup: the anchor of the push-unmount control is in machine-mounts.js');
  const D5 = scratch('hosts-held-census'); fs.rmSync(D5, { recursive: true, force: true }); fs.mkdirSync(D5, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(D5, { recursive: true, force: true }); } catch { } });
  const mountScene = async (Mod, tag) => {
    const M = Object.create(Mod.MachineMounts.prototype);
    const revoked = [];
    Object.assign(M, { dataDir: D5, _file: path.join(D5, tag + '.json'), _hold: { held: () => null, writable: () => true }, hosts: heldHosts, mountTokens: { revoke: (t) => revoked.push(t) },   /* 2b: the mounts list's own hold, not held (the stand-in carries what the store asks) */ broadcast: () => { }, log: () => { }, _live: new Map(), _pushTunnelOwned: new Map(), _pushRetryAt: new Map(), _pushDown: new Map(), _pullErrors: new Map(),
      _state: { mounts: [{ id: 'mm-1', dir: 'push', hostId: 'h-0001', tokenId: 'tok-1', method: 'rclone-webdav', mountpoint: '/mnt/x' }] } });
    const code = await codeOf(() => M.unmount('mm-1'));
    return { code, kept: M._state.mounts.length, revoked: revoked.length };
  };
  const mm = await mountScene(require(path.join(ROOT, 'src/machine-mounts.js')), 'real');
  const mmx = await mountScene(MJ.load('src/machine-mounts.js', anchored(MSRC, UH, '', 'hhc-485a'), 'mm-no-held'), 'mut');
  ok(mm.code === 'hosts-unread' && mm.kept === 1 && mm.revoked === 0, 'a push mount\'s removal while held is refused by name — its record and its token stay (its unmount runs ON the machine)', mm);
  // 主开发 01:20Z (1), its audit: a push mount's way back to this instance while held — no tunnel, no public address: the hold by name
  const NOPATH = "    if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) throw Object.assign(new Error(`reaching this instance from a machine: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 });\n";
  ok(MSRC.split(NOPATH).length === 2, 'control setup: the dav path\'s held check is found once');
  const davScene = async (Mod) => { const M = Object.create(Mod.MachineMounts.prototype); Object.assign(M, { hosts: heldHosts, localPort: () => 0, publicUrl: () => '' }); try { await M._davBase('h-0001'); return 'answered'; } catch (e) { return e.code === 'hosts-unread' ? e.code : /no path/.test(String(e.message)) ? 'no-path' : e.code || 'threw'; } };   // B-af94's coded refusal (no_dav_path) says the same words
  const dv = await davScene(require(path.join(ROOT, 'src/machine-mounts.js'))), dvx = await davScene(MJ.load('src/machine-mounts.js', anchored(MSRC, NOPATH, '', 'hhc-491a'), 'mm-dav-no-held'));
  ok(dv === 'hosts-unread' && dvx === 'no-path', 'a push mount with no way back while held is refused by the hold\'s name; CONTROL (the check cut, in a copy): «no path for the remote to reach this instance» — RED', { dv, dvx });
  ok(mmx.code === 'answered' && mmx.kept === 0 && mmx.revoked === 1, 'CONTROL (the held check cut, in a copy): the record is dropped and the token revoked while the machine\'s unmount was swallowed', mmx);
  // (d) machine-mounts' one-time legacy ingest on a HELD boot (H10, its read S1): no device is looked up — the keys are derived as the
  //     pairing minted them, the legacy file is migrated (renamed), nothing is lost for good
  {
    const MM = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
    const KEY = "      hostId: (this.hosts.held?.() ? null : this.hosts.findByDeviceId?.(m.deviceId)?.id) || ";
    ok(MM.split(KEY).length === 2, 'control setup: the anchor of the legacy-ingest control is in machine-mounts.js');
    const legacy = (Mod, name) => {
      const d = path.join(D5, name); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'device-mounts.json'), JSON.stringify({ mounts: [{ id: 'mm-a', deviceId: 'mac-1', remotePath: '/r', mountpoint: '/m/a' }, { id: 'mm-b', deviceId: 'grad-host-1234', remotePath: '/s', mountpoint: '/m/b' }] }));
      const M = new Mod.MachineMounts({ dataDir: d, hosts: heldHosts, mountTokens: { list: () => [], revoke() { } }, broadcast() { }, log() { } });
      try { clearInterval(M._sweep); } catch { }
      const keys = (M._state.mounts || []).filter((m) => m.dir === 'pull').map((m) => m.hostId).join();
      return { keys, migrated: fs.existsSync(path.join(d, 'device-mounts.json.migrated')), left: fs.existsSync(path.join(d, 'device-mounts.json')) };
    };
    const lg = legacy(require(path.join(ROOT, 'src/machine-mounts.js')), 'legacy-held');
    const lgx = legacy(MJ.load('src/machine-mounts.js', anchored(MM, KEY, '      hostId: this.hosts.findByDeviceId?.(m.deviceId)?.id || ', 'hhc-509a'), 'legacy-lookup'), 'legacy-held-mut');   // stale-pins: kept (the control plants the release's text in a copy)
    ok(lg.keys === 'host-dial-mac-1,host-1234' && lg.migrated && !lg.left, 'a HELD boot migrates the legacy pull mounts under the keys the pairing minted (host-dial-<id>, a graduated machine\'s own id) — never a wait that machine-mounts.json then ends for good', lg);
    ok(lgx.keys === '' && lgx.left, 'CONTROL (the lookup asked while held, in a copy): it throws, the pull mounts are not ingested and the legacy file stays — while machine-mounts.json is written (the one-time ingest never runs again)', lgx);
  }
  // (c) hosts.linkState while held: 'offline' — the pool's dark-source defense stays on (H3)
  const HSRC = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const LH = "    if (this._unread) return 'offline';\n    let h; try { h = this.get(id); } catch { return 'unknown'; }";
  ok(HSRC.split(LH).length === 2, 'control setup: the anchor of the linkState control is in hosts.js');
  const linkOf = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; heldBy(H); try { return H.linkState('h-0001'); } catch (e) { return 'threw:' + (e && e.code); } };
  const lk = linkOf(require(path.join(ROOT, 'src/hosts.js')));
  const lkx = linkOf(MJ.load('src/hosts.js', anchored(HSRC, LH, '    const h = this.get(id);', 'hhc-519a'), 'link-no-held'));
  ok(lk === 'offline' && lkx === 'threw:hosts-unread', 'linkState while held answers «offline» (a dark source); CONTROL (the release\'s first line, in a copy): it throws — usage-pool-engine\'s darkSources swallowed it into an EMPTY list', { lk, lkx });
}

// ── §5b B-06de's two readers of the machines list (the move onto 921c0de17 met them): a HELD answer (`unread`) is said as unread ──
console.log('§5b B-06de\'s machines-list readers take a held answer as unread');
{
  const HELD = { hosts: [], key: { exists: true }, unread: 'hosts.json in VibeSpace\'s data folder could not be read (EACCES)' };   // GET /api/hosts while held (exit-routes)
  const bodyOf = (src, head) => { const i = src.indexOf(head); if (i < 0) return null; const j = src.indexOf('{', i + head.length); let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(j, k + 1); } return null; };
  // (a) the group door (sidebar-tasks _openGroupSession): a group whose first folder is on h-0001, the list held
  const STS = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-tasks.js'), 'utf8');
  const OG = 'proto._openGroupSession = async function(task, extra = {})', UR = 'const unread = !d || d.error || d.unread || !Array.isArray(d.hosts);';
  ok(STS.includes(OG) && STS.split(UR).length === 2, 'control setup: the group door and its held read are in sidebar-tasks.js');
  const openScene = async (src) => {
    const io = { said: [], opened: 0 };
    // eslint-disable-next-line no-new-func
    const door = new Function('fetchJson', 'showToast', 'tr', 'openMachinesTab', `return async function(task, extra = {}) ${bodyOf(src, OG)};`)(
      async () => HELD, (m) => io.said.push(/cannot be read right now/.test(m) ? 'unread' : /not paired any more/.test(m) ? 'not-paired' : m), (t, v) => (v ? t.replace(/\{(\w+)\}/g, (x, k) => String(v[k])) : t), () => { });
    const r = await door.call({ _firstFolder: () => ({ cwd: '/srv/app', hostId: 'h-0001' }), app: { showNewSessionDialog: () => { io.opened++; return 'opened'; }, openTaskDetail() { } } }, { id: 'T-1' });
    return { r, opened: io.opened, said: io.said };
  };
  const og = await openScene(STS), ogx = await openScene(anchored(STS, UR, 'const unread = !d || d.error || d.held || !Array.isArray(d.hosts);', 'hhc-5b1'));   // stale-pins: kept (the control plants the first read's text in a copy)
  ok(og.r === null && og.opened === 0 && JSON.stringify(og.said) === '["unread"]' && ogx.r === null && JSON.stringify(ogx.said) === '["not-paired"]',
    'B-06de\'s group door while the machines list is HELD: nothing is opened and the list is said as UNREAD («cannot be read right now»); CONTROL (the door\'s first read, `d.held` — a mark the hub never sends, in a copy): «not paired any more», a false word that sends the person to re-point the row — RED', { og, ogx });
  // (b) the group window's fresh read (task-detail freshHosts): the roster it holds, the list held
  const TDS = fs.readFileSync(path.join(ROOT, 'src/lib/task-detail.js'), 'utf8');
  const FH = '  const freshHosts = () => {\n', FU = 'if (closed || !d || d.unread || !Array.isArray(d.hosts)) return;';
  const fi = TDS.indexOf(FH), fj = fi < 0 ? -1 : TDS.indexOf('\n  };\n', fi);
  ok(fi > 0 && fj > fi && TDS.slice(fi, fj).split(FU).length === 2, 'control setup: freshHosts and its held read are in task-detail.js');
  const freshScene = async (src) => {
    const i = src.indexOf(FH), j = src.indexOf('\n  };\n', i);
    const kept = { hosts: [{ id: 'h-0001', name: 'Build box' }] }, sidebar = { _hostsData: kept, _lastRunSeen: null };
    let painted = 0;
    // eslint-disable-next-line no-new-func
    const fresh = new Function('fetchJson', 'sidebar', 'overlayLastRuns', 'state', 'renderSettings', `let hostsAskedAt = 0, closed = false;\n${src.slice(i, j + 5)}\nreturn freshHosts;`)(
      () => Promise.resolve(HELD), sidebar, () => { }, { tab: 'settings' }, () => { painted++; });
    fresh(); await new Promise((r) => setImmediate(r));
    return { kept: sidebar._hostsData === kept, painted };
  };
  const fh = await freshScene(TDS), fhx = await freshScene(anchored(TDS, FU, 'if (closed || !d || !Array.isArray(d.hosts)) return;', 'hhc-5b2'));   // stale-pins: kept (the control plants the first read's text in a copy)
  ok(fh.kept && fh.painted === 0 && !fhx.kept && fhx.painted === 1,
    'B-06de\'s group window re-reading the machines list while HELD: the roster it holds is KEPT and nothing repaints; CONTROL (the read\'s first line, in a copy): the held answer (no machines) becomes the roster and the Context table repaints with its machine rows as not paired — RED', { fh, fhx });
}

// ── §6 WIRING (its read r2, N14): the boot's re-adoption waits for the read at its one caller; both installers word exit 16 as a wait ──
console.log('§6 wiring: the re-adoption waits at its caller; the installers say the wait');
{
  const SV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const SH = fs.readFileSync(path.join(ROOT, 'scripts/vibespace-agentd-install.sh'), 'utf8'), PS = fs.readFileSync(path.join(ROOT, 'scripts/vibespace-agentd-install.ps1'), 'utf8');
  ok(SV.includes("const held = !!(hosts.held && hosts.held() && hosts.whenRead); (held ? (keep(), Promise.resolve()) : go()).finally(() => { if (resumeRoad) resumeRoad.adopted(); });") && SV.includes(".finally(() => { _arRestoreSettled = true; if (resumeRoad) resumeRoad.adoptedRemote(); });"),
    'server.js: the boot\'s re-adoption of remote sessions waits for the read while hosts.json is held (its get threw: the pass ended, a later resume killed the agent it would adopt) — the LOCAL resume road opens at once then, the REMOTE one when the re-adoption settles (§10 drives it)');
  const i16 = SH.indexOf('if [ "$CHECK_RC" -eq 16 ]; then'), ine = SH.indexOf('if [ "$CHECK_RC" -ne 0 ]; then'), p16 = PS.indexOf('if ($checkRc -eq 16) {'), pne = PS.indexOf('if ($checkRc -ne 0) {');
  ok(i16 > 0 && ine > i16 && /run this same command again in a few minutes/.test(SH.slice(i16, ine)) && p16 > 0 && pne > p16 && /run this same command again in a few minutes/.test(PS.slice(p16, pne)),
    'both installers word the check\'s exit 16 (the hub holds its machines) as a wait BEFORE the generic «the device cannot dial» line', { i16, ine, p16, pne });
}

// ── §7 主开发 01:20Z (3): the page's and the agent's browser-providers routes give ONE answer for a paired machine while held ────
console.log('§7 the browser-providers routes (the page\'s and the agent\'s) answer a held machines list the same: unknown, with the hold\'s words');
{
  const RB = fs.readFileSync(path.join(ROOT, 'src/routes/browser.js'), 'utf8');
  const viewOf = (src) => { const i = src.indexOf('function hostKnownView(k, h) {'); if (i < 0) return null; const j = src.indexOf('\n}\n', i); return j < 0 ? null : new Function(`${src.slice(i, j + 2)}\nreturn hostKnownView;`)(); };   // eslint-disable-line no-new-func
  const routeOf = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n});\n', i); return j < 0 ? '' : src.slice(i, j); };
  const PAGE = "router.get('/api/browser/providers', (req, res) => {", AGENT = "router.get('/api/agent/browser/providers', async (req, res) => {";
  const judge = (src) => {
    const V = viewOf(src); const pr = routeOf(src, PAGE), ar = routeOf(src, AGENT);
    const keeper = (held) => ({ machinesHeld: () => (held ? 'hosts.json in VibeSpace\'s data folder could not be read (EACCES)' : null), hostKnown: (id) => id === 'host-0001' });
    return {
      held: V ? V(keeper(true), 'host-0001') : null, known: V ? V(keeper(false), 'host-0001') : null, local: V ? V(keeper(true), null) : null,
      both: pr.includes('...hostKnownView(k, h)') && ar.includes('...hostKnownView(k, h)'),
      raw: [pr, ar].some((r) => r.includes('k.hostKnown(')),
    };
  };
  const J = judge(RB);
  ok(J.held && J.held.hostKnown === null && /could not be read/.test(J.held.held) && J.known && J.known.hostKnown === true && !('held' in J.known) && J.local && J.local.hostKnown === true,
    'hostKnownView: a paired machine while held is «unknown» with the hold\'s words (never «not paired»); read, it is the keeper\'s answer; this machine is always known', J);
  ok(J.both && !J.raw, 'both providers routes (the page\'s GET /api/browser/providers and the agent\'s) answer through hostKnownView — neither asks hostKnown raw', J);
  const RAWLINE = 'res.json({ providers: rows, host: h, ...hostKnownView(k, h), forwards:';
  ok(RB.split(RAWLINE).length === 2, 'control setup: the page route\'s answer is found once');
  const JX = judge(RB.replace(RAWLINE, 'res.json({ providers: rows, host: h, hostKnown: h ? k.hostKnown(h) : true, forwards:'));   // stale-pins: kept (the control plants the page route's old answer in the source)
  ok(!JX.both && JX.raw, 'CONTROL (the page route\'s answer as it was, in the source): it asks hostKnown raw — «not paired» for a held list — RED', JX);
}

// ── §8 主开发 01:20Z (5): the hold's 503 is worded ON THE PAGE by its code (zh / ja) — never the server's English ──────────────────
console.log('§8 the page words `hosts-unread` itself: a usage refresh, the dial status (fetchJson), the exit dialog, a machine\'s removal');
{
  const U = fs.readFileSync(path.join(ROOT, 'src/lib/utils.js'), 'utf8'), EX = fs.readFileSync(path.join(ROOT, 'src/lib/exit-access-dialog.js'), 'utf8'), SM = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-mounts.js'), 'utf8');
  const SENT = 'VibeSpace cannot read its paired machines right now — nothing was paired or changed. Try again in a few minutes (it reads them again by itself).';
  const wordsOf = (src) => {
    const i = src.indexOf('export function hostsHeldWords() {'), j = src.indexOf('\n}\n', src.indexOf('function refusalWords(body) {'));
    if (i < 0 || j < 0) return null;
    return new Function('t', `${src.slice(i, j + 2).replaceAll('export function', 'function')}\nreturn refusalWords;`)((k) => `«${k}»`);   // eslint-disable-line no-new-func
  };
  const HELD = { error: 'removing a machine: hosts.json in VibeSpace\'s data folder could not be read (EACCES); …', code: 'hosts-unread' };
  const RW = wordsOf(U), w = RW && RW(HELD), other = RW && RW({ error: 'no such machine', code: 'not-found' });
  ok(w && w.error === `«${SENT}»` && w.said === HELD.error && w.code === 'hosts-unread' && other && other.error === 'no such machine',
    'fetchJson\'s refusalWords words `hosts-unread` by its code (the server\'s words kept as `said`); another refusal passes as it came', { w, other });
  const ROWU = "  if (body && typeof body === 'object' && body.code === 'hosts-unread') return { ...body, said: body.error, error: hostsHeldWords() };";
  ok(U.split(ROWU).length === 2, 'control setup: the row is found once');
  const wx = wordsOf(U.replace(ROWU, '')); const wxx = wx && wx(HELD);
  // B-f276 family (主开发 r3032): a held code with no row of its own now takes the family's ONE generic sentence (utils.js HELD_CODE_RE) — the
  // row cut loses the machines' own words, never to the hub's English
  const GENERIC = '«VibeSpace cannot read one of its saved lists right now — nothing was changed. Try again in a few minutes.»';
  ok(wxx && wxx.error === GENERIC && wxx.error !== `«${SENT}»`, 'CONTROL (the row cut, in the source): the machines\' own sentence is lost (the family\'s generic one stands in, never the server\'s English) — RED', wxx);
  ok(EX.includes("    case 'hosts-unread': return hostsHeldWords();") && EX.includes("body.textContent = codeWords(e.code, { error: e.message });") && EX.includes("import { createModalShell, showToast, hostsHeldWords } from './utils.js';"),
    'the exit dialog (opened and saved, and the dial status through exitCodeWords) words `hosts-unread` by its code');
  ok(SM.includes("why: e && e.code === 'hosts-unread' ? hostsHeldWords() : e && e.code === 'tokens_unread' ? thrownText(e) : (e && e.message) || tr('server unreachable')"), 'a machine\'s removal words `hosts-unread` by its code');
  for (const lang of ['zh', 'ja']) ok(fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8').includes(JSON.stringify(SENT) + ':'), `the sentence has its ${lang} row`);
  // the stores chain's read on 921c0de17 (its should): a MOUNTS hold is worded too, and both holds on the mount doors' one api() —
  // a mount's add / remove / mount-again and a machine's removal showed the hub's English
  const MSENT = 'VibeSpace cannot read the machines’ mounts right now — nothing was changed. Try again in a few minutes (it reads them again by itself).';
  const MHELD = { error: 'adding a push mount: machine-mounts.json in VibeSpace\'s data folder could not be read (EACCES); …', code: 'mounts-unread' };
  const ROWM = "  if (body && typeof body === 'object' && body.code === 'mounts-unread') return { ...body, said: body.error, error: mountsHeldWords() };\n";
  const wm = RW && RW(MHELD), RWX = wordsOf(anchored(U, ROWM, '', 'hhc-8m1')), wmx = RWX && RWX(MHELD);
  ok(wm && wm.error === `«${MSENT}»` && wm.said === MHELD.error && wm.code === 'mounts-unread' && wmx && wmx.error === GENERIC,
    'fetchJson\'s refusalWords words `mounts-unread` by its code (the server\'s words kept as `said`); CONTROL (the row cut, in a copy): the mounts\' own sentence is lost (the family\'s generic one stands in) — RED', { wm, wmx });
  const MDS = fs.readFileSync(path.join(ROOT, 'src/lib/mounts-dialog.js'), 'utf8');
  const AH = 'export async function api(url, opts = {}) {', HW = "  const worded = d.code === 'hosts-unread' ? hostsHeldWords() : d.code === 'mounts-unread' ? mountsHeldWords()\n    : d.code";
  ok(MDS.includes(AH) && MDS.split(HW).length === 2, 'control setup: the mount doors\' api() and its hold branch are in mounts-dialog.js');
  const ANS = {
    '/api/machine-mounts/h-0001': { status: 503, body: MHELD },
    '/api/hosts/h-0001': { status: 503, body: { error: 'removing a machine: hosts.json in VibeSpace\'s data folder could not be read (EACCES); …', code: 'hosts-unread' } },
    '/api/hosts/h-0002': { status: 503, body: { error: 'removing a machine: machine-mounts.json in VibeSpace\'s data folder could not be read (EACCES); …', code: 'mounts-unread' } },
    '/api/machine-mounts/mm-1/remount': { status: 400, body: { error: 'machine is offline — start its daemon first', code: 'machine_offline_start' } },
  };
  const doorsSay = async (src) => {
    const i = src.indexOf(AH), j = src.indexOf('\n}\n', i);
    // eslint-disable-next-line no-new-func
    const api = new Function('fetch', 'hostsHeldWords', 'mountsHeldWords', 'mountWords', 'tr', 'resolveLang', `${src.slice(i, j + 2).replace('export async function', 'async function')}\nreturn api;`)(
      async (url) => ({ ok: false, status: ANS[url].status, json: async () => ANS[url].body }), () => `«${SENT}»`, () => `«${MSENT}»`,
      (c) => (c === 'machine_offline_start' ? '«machine_offline_start»' : null), (k) => k, () => 'en');
    const out = [];
    for (const url of Object.keys(ANS)) { try { await api(url, { method: 'POST' }); out.push('answered'); } catch (e) { out.push(e.message); } }
    return out;
  };
  const ds = await doorsSay(MDS), dsx = await doorsSay(anchored(MDS, HW, '  const worded = d.code', 'hhc-8m2'));
  ok(JSON.stringify(ds) === JSON.stringify([`«${MSENT}»`, `«${SENT}»`, `«${MSENT}»`, '«machine_offline_start»']) && JSON.stringify(dsx) === JSON.stringify([MHELD.error, ANS['/api/hosts/h-0001'].body.error, ANS['/api/hosts/h-0002'].body.error, '«machine_offline_start»']),
    'the mount doors\' one api(): a mount refused while machine-mounts.json is held and a machine\'s removal while hosts.json OR machine-mounts.json is held say the page\'s sentence (by the hold\'s code, on any route); a coded mount refusal keeps B-af94\'s words; CONTROL (the hold branch cut, in a copy): the hub\'s English for both — RED', { ds, dsx });
  const HOH = 'export function heldWordsOf(d) {';
  const heldOf = (src) => { const i = src.indexOf('export function hostsHeldWords() {'), k = src.indexOf(HOH), j = k < 0 ? -1 : src.indexOf('\n', k);
    if (i < 0 || j < 0) return null;
    return new Function('t', `${src.slice(i, j).replaceAll('export function', 'function')}\nreturn heldWordsOf;`)((s) => `«${s}»`); };   // eslint-disable-line no-new-func
  const HO = heldOf(U), HOX = heldOf(anchored(U, "d && d.code === 'mounts-unread' ? mountsHeldWords() : d && d.code === 'store_unread'", "d && d.code === 'store_unread'", 'hhc-8m3'));
  const ho = HO && [HO({ code: 'hosts-unread', error: 'x' }), HO({ code: 'mounts-unread', error: 'x' }), HO({ code: 'no_dav_path', error: 'x' }), HO(null)];
  ok(!!ho && JSON.stringify(ho) === JSON.stringify([`«${SENT}»`, `«${MSENT}»`, null, null]) && !!HOX && HOX({ code: 'mounts-unread' }) === GENERIC,
    'heldWordsOf: a hold\'s code (machines, mounts) → the page\'s sentence; another code or none → null (its own words stand); CONTROL (the mounts branch cut, in a copy): the mounts\' own sentence is lost (the family\'s generic one stands in) — RED', { ho });
  // the pages that fetch by hand: each refusal line asks heldWordsOf first (the exit runs and device activity dialogs; Settings' config export and import)
  const HAND = [['src/lib/exit-runs-dialog.js', 1], ['src/lib/device-acts-dialog.js', 1], ['src/lib/app.js', 1]].map(([f, n]) => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); return { f, want: n, got: (t.match(/throw new Error\(heldWordsOf\(d\) \|\| d\.error \|\| `HTTP \$\{res\.status\}`\)|\(heldWordsOf\(d\) \|\| credentialDoorWords\(d\) \|\| d\.error/g) || []).length, bare: (t.match(/throw new Error\(d\.error \|\| `HTTP \$\{res\.status\}`\)|: \(credentialDoorWords\(d\) \|\| d\.error \|\| t\('Export failed'\)/g) || []).length }; });   // stale-pins: kept (the bare forms are counted to be ABSENT)
  ok(HAND.every((h) => h.got === h.want && h.bare === 0), 'the pages that fetch by hand word a hold first (heldWordsOf) — the exit runs dialog, the device activity dialog, Settings\' config export (its import route never answers a hold\'s code); none shows the hub\'s English for it', HAND);
  // graduate-dial (Remove dial-out): its handler, compiled from its source, over a HELD machines list — 503 with the hold's name, so the page words it
  const PW = fs.readFileSync(path.join(ROOT, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const GH = "app.post('/api/hosts/:id/graduate-dial', async (req, res) => {", GC = "  } catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name (the page words it); every other refusal 400 with its code as well as its words (lane lg-remote-hardening)";   // the meeting with lane lg-remote-hardening (list line 69): ONE catch — the hold's 503 with its name, every other refusal 400 with its code
  const gi = PW.indexOf(GH), gj = gi < 0 ? -1 : PW.indexOf('\n});\n', gi);
  ok(gi > 0 && gj > gi && PW.slice(gi, gj).split(GC).length === 2, 'control setup: graduate-dial\'s handler and its catch are in mounts-plugins-wiring.js');
  const gradOf = async (src) => {
    const i = src.indexOf(GH), j = src.indexOf('\n});\n', i);
    const held = { get: () => { throw Object.assign(new Error('graduating a machine: hosts.json in VibeSpace\'s data folder could not be read (EACCES); …'), { code: 'hosts-unread', status: 503 }); } };
    // eslint-disable-next-line no-new-func
    const h = new Function('hosts', `return (${src.slice(i + "app.post('/api/hosts/:id/graduate-dial', ".length, j + 2)});`)(held);
    let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = { status: this.code, ...b }; return this; } };
    await h({ params: { id: 'h-0001' }, body: {}, headers: {} }, res); return out;
  };
  const gd = await gradOf(PW), gdx = await gradOf(anchored(PW, GC, '  } catch (e) { res.status(400).json({ error: e.message }); }', 'hhc-8m4'));
  ok(!!gd && gd.status === 503 && gd.code === 'hosts-unread' && !!gdx && gdx.status === 400 && !gdx.code,
    'Remove dial-out (graduate-dial) while the machines list is held: 503 with the hold\'s name, so the page words it; CONTROL (the bare 400 put back, in a copy): a «400» with no name, the hub\'s English on the page — RED', { gd, gdx });
  // the cures' read (round 2): three more Machines routes answered a held list as a bare 400 — Test connection, Install / Uninstall agent tools
  const ER = fs.readFileSync(path.join(ROOT, 'src/server/exit-routes.js'), 'utf8');
  const KEEPC = "  catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.status === 503 && e.code ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name";
  const ROUTES = [
    { name: 'test', head: "app.post('/api/hosts/:id/test', ", call: "hosts.test(req.params.id, { by: DAU.byOfReq(req) })) }); }\n", catch: "  catch (e) { const held = !!e && e.status === 503; res.status(held ? 503 : 400).json({ error: e.message, ...(held && e.code ? { code: e.code } : e && e.code === 'host-key-changed' ? { code: e.code, fp: e.fp || null, pinned: !!e.pinned, ...(e.jump ? { jump: e.jump } : {}), ...(e.pinLine ? { pinLine: e.pinLine } : {}) } : e && e.code === 'host-key-name' ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name (bl-jobs, line 124); every other refusal 400 with its words — a changed key (or a pin that cannot be used) with its code and facts (lane lg-remote-hardening)" },   // the meeting with list line 69: its host-key facts in the same catch
    { name: 'install', head: "app.post('/api/hosts/:id/agent-tools/install', ", call: "hosts.installAgentTools(req.params.id, AGENT_BIN_DIR), bad = (r && r.notLanded) || []; res.json({ success: !bad.length, ...r, ...(bad.length ? { error: `not everything landed on that machine: ${bad.join('; ')}` } : {}) }); }\n" },   // r3064 (4): the call's text moved with the route
    { name: 'uninstall', head: "app.post('/api/hosts/:id/agent-tools/uninstall', ", call: "hosts.uninstallAgentTools(req.params.id); res.json({ success: !(r && r.ok === false), ...r }); }\n" },
  ];
  ok(ROUTES.every((r) => ER.split(r.head).length === 2 && ER.split(r.call + (r.catch || KEEPC)).length === 2), 'control setup: the three routes and their catches are in exit-routes.js');
  const routeOf = async (src, r) => {
    const i = src.indexOf(r.head), j = src.indexOf('\n});\n', i);
    const thrower = async () => { throw Object.assign(new Error('hosts.json in VibeSpace\'s data folder could not be read (EACCES); …'), { code: 'hosts-unread', status: 503 }); };
    // eslint-disable-next-line no-new-func
    const h = new Function('hosts', 'DAU', 'integrationEnabled', 'AGENT_BIN_DIR', `return (${src.slice(i + r.head.length, j + 2)});`)({ test: thrower, installAgentTools: thrower, uninstallAgentTools: thrower }, { byOfReq: () => null }, () => true, '/x');
    let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = { status: this.code, ...b }; return this; } };
    await h({ params: { id: 'h-0001' }, body: {}, headers: {} }, res); return out;
  };
  const rr = [], rrx = [];
  for (const r of ROUTES) { rr.push(await routeOf(ER, r)); rrx.push(await routeOf(anchored(ER, r.call + (r.catch || KEEPC), r.call + '  catch (e) { res.status(400).json({ error: e.message }); }', 'hhc-8r-' + r.name), r)); }
  ok(rr.every((o) => o && o.status === 503 && o.code === 'hosts-unread') && rrx.every((o) => o && o.status === 400 && !o.code),
    'Test connection, Install and Uninstall agent tools while the machines list is held: 503 with the hold\'s name, so the page words it; CONTROL (each bare 400 put back, in a copy): «400» with no name — RED', { rr, rrx });
  for (const lang of ['zh', 'ja']) ok(fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8').includes(JSON.stringify(MSENT) + ':'), `the mounts hold's sentence has its ${lang} row`);
  // the held-words line's LEFT (主开发 04:49Z: rides the park's line): Settings' config IMPORT while hosts.json is held answered 200 with the
  // hosts section's English inside `applied` — the import names the hold by its CODE now and the page words it (hostsHeldWords, zh / ja)
  const HS8 = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const IMPC = "skipped: true, code: 'hosts-unread' };";
  const impOf = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; heldBy(H); try { const r = H.importBundle({ hosts: [{ id: 'h-0002', name: 'x', host: 'x.invalid' }] }); return { code: r && r.code || null, skipped: !!(r && r.skipped) }; } catch (e) { return { threw: (e && e.code) || 'threw' }; } };
  const im = impOf(require(path.join(ROOT, 'src/hosts.js'))), imx = impOf(MJ.load('src/hosts.js', anchored(HS8, IMPC, 'skipped: true };', 'hhc-8i1'), 'import-no-code'));   // stale-pins: kept (the control plants the release's text in a copy)
  ok(im.code === 'hosts-unread' && im.skipped && imx.skipped && imx.code === null, 'hosts.importBundle while held: skipped, with the hold\'s CODE (the page words it); CONTROL (the code cut, in a copy): no code — the route can only pass the English on — RED', { im, imx });
  const PRS = fs.readFileSync(path.join(ROOT, 'src/routes/persistence.js'), 'utf8'), APS = fs.readFileSync(path.join(ROOT, 'src/lib/app.js'), 'utf8');
  ok(PRS.includes("        if (r && r.code === 'hosts-unread') held.push(r.code); else applied.push(warn.length ? 'hosts (' + warn.join('; ') + ')' : 'hosts');")
    && PRS.includes("    res.json({ success: true, applied, clientPrefs, ...(held.length ? { held } : {}), ")   // (B-225b's move: the answer names its `setAside` after `held`)
    && APS.includes("const heldSaid = [Array.isArray(d.held) && d.held.includes('hosts-unread') ? t('Your machines were not imported — VibeSpace cannot read its paired machines right now. Import them again in a few minutes.') : null,")   // B-f276 family unit 1: the storage's held sentence joins it (one line, one wait)
    && APS.includes("if (heldSaid && !(d.applied || []).length) { err.textContent = heldSaid; return; }")
    && APS.includes("showToast([t('Imported: {sections} — reloading…', { sections: d.applied.join(', ') }), heldSaid].filter(Boolean).join(' '), heldSaid ? { type: 'warn', duration: 8000 } : undefined);")
    && APS.includes('setTimeout(() => location.reload(), heldSaid ? 8000 : 900);'),
    'the config import: the route answers a held hosts section as `held` (its code), never English inside `applied`; the page says the hold\'s sentence beside «Imported: …» and waits 8 s before the reload — or, nothing else imported, says it on the form\'s line and reloads nothing');
  // the import round's read (its should): the ROUTE driven — a bundle exported with the machines, imported while hosts.json is held
  const HELDLINE = "        if (r && r.code === 'hosts-unread') held.push(r.code); else applied.push(";
  ok(PRS.split(HELDLINE).length === 2, 'control setup: the import route\'s held branch is found once');
  const routeImport = async (Pmod, tag) => {
    const D = scratch('hosts-held-census-imp-' + tag); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
    let mode = 'export';
    const hostsStub = { exportBundle: () => ({ hosts: [{ id: 'h-0001', name: 'box' }] }), unreadWords: () => null,
      importBundle: () => (mode === 'held' ? { warnings: ['the machines were not imported — hosts.json in VibeSpace\'s data folder could not be read (EACCES)'], skipped: true, code: 'hosts-unread' } : { warnings: [] }) };
    Pmod.setup({ dataDir: D, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => hostsStub, getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
    const door = (p) => Pmod.router.stack.find((l) => l.route && l.route.path === p && l.route.methods.post).route.stack[0].handle;
    const call = (p, body) => new Promise((resolve) => { const out = { status: 200 }; const res = { status(c) { out.status = c; return this; }, set() { return this; }, setHeader() { }, get() { return undefined; }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); } }; door(p)({ body, headers: { 'sec-fetch-site': 'same-origin' }, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out)); });
    const ex = await call('/api/config/export', { sections: [], includeSensitive: ['hosts'], passphrase: 'walk-pass-0001' });
    mode = 'held';
    const im = ex.body && ex.body.sensitive ? await call('/api/config/import', { file: ex.body, sections: [], includeSensitive: ['hosts'], passphrase: 'walk-pass-0001' }) : null;
    try { fs.rmSync(D, { recursive: true, force: true }); } catch { }
    return { exported: ex.status, status: im && im.status, applied: im && im.body && im.body.applied, held: (im && im.body && im.body.held) || null };
  };
  const ri = await routeImport(require(path.join(ROOT, 'src/routes/persistence.js')), 'a');
  const rix = await routeImport(MJ.load('src/routes/persistence.js', anchored(PRS, HELDLINE, '        applied.push(', 'hhc-8i2'), 'import-held-cut'), 'b');
  ok(ri.exported === 200 && ri.status === 200 && Array.isArray(ri.applied) && !ri.applied.some((a) => /^hosts/.test(a)) && JSON.stringify(ri.held) === '["hosts-unread"]'
    && rix.status === 200 && Array.isArray(rix.applied) && rix.applied.some((a) => /^hosts \(the machines were not imported — hosts\.json/.test(a)) && rix.held === null,
    'the import route, driven: a bundle with the machines imported while hosts.json is held answers `held: [hosts-unread]` and no hosts entry in `applied`; CONTROL (the held branch cut, in a copy): the English hold words inside `applied`, no `held` — RED', { ri, rix });
  const ISENT = 'Your machines were not imported — VibeSpace cannot read its paired machines right now. Import them again in a few minutes.';
  for (const lang of ['zh', 'ja']) ok(fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8').includes(JSON.stringify(ISENT) + ':'), `the import\'s held sentence has its ${lang} row`);
}

// ── §9 round wojcq4hn4 (its MUST): a held list is unknown BY NAME on the two doors the meeting cured — never «offline», never a bare 400
console.log('§9 a REAL held HostManager behind a pull mount\'s shadow and the files route\'s answer, and behind a machine\'s public key');
{
  const D9 = scratch('hosts-held-census-9'); fs.rmSync(D9, { recursive: true, force: true }); fs.mkdirSync(D9, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(D9, { recursive: true, force: true }); } catch { } });
  const asRoot9 = typeof process.getuid === 'function' && process.getuid() === 0;
  const HF = path.join(D9, 'hosts.json'); const hbody = JSON.stringify({ hosts: [{ id: 'h-0001', name: 'build-box', transport: 'dial', deviceId: 'build-box' }] });
  if (asRoot9) fs.mkdirSync(HF); else { fs.writeFileSync(HF, hbody); fs.chmodSync(HF, 0o000); }   // held: the read fails (EACCES; a folder as root)
  const H = new (require(path.join(ROOT, 'src/hosts.js')).HostManager)({ dataDir: D9 });
  ok(H.held && H.held(), 'the stand-in: a REAL HostManager over an unreadable hosts.json is held');
  // (a) MachineMounts.shadowedBy → the files route's body
  const MSRC9 = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8'), FSRC9 = fs.readFileSync(path.join(ROOT, 'src/routes/files.js'), 'utf8');
  // the restack onto checkpoint 60 (bl-machines-a's line 244): the body lives in src/machine-mounts.js (the files route and WebDAV alias
  // it), and the hosts hold is `hostsHeld` — another meaning than a PAIR-held record (`_held`)
  const HELDRET = "    if (best.h.hostsHeld) return { id: best.m.id, hostId: best.m.hostId, machine, name: machine, mountpoint: best.mp, hostsHeld: true,";
  const BODYHELD = "  if (s.hostsHeld) return { error: `“${s.machine}”’s folder: ${s.hostsHeldWords || 'the paired machines cannot be read right now'}`, code: 'hosts-unread', params };\n";
  const bodyOf = (src) => { const i = src.indexOf('function pullShadowBody(s) {'), j = src.indexOf('\n}\n', i); return new Function(`${src.slice(i, j + 2)}\nreturn pullShadowBody;`)(); };   // eslint-disable-line no-new-func
  const MP9 = path.join(D9, 'mnt', 'box');
  // the product's own _online over the held store (its read N2: no stub)
  const shadow = (Mod) => { const M = Object.create(Mod.MachineMounts.prototype); Object.assign(M, { hosts: H, _state: { mounts: [{ id: 'mm-p1', dir: 'pull', hostId: 'h-0001', mountpoint: MP9 }] }, _live: new Map(), _realMp: new Map(), _held: new Map(), _bare: new Map([['mm-p1', 'empty']]) }); return M.shadowedBy(path.join(MP9, 'notes.md'), { writer: true }); };
  const s9 = shadow(require(path.join(ROOT, 'src/machine-mounts.js'))), b9 = bodyOf(MSRC9)(s9);
  ok(!!s9 && s9.hostsHeld === true && !s9.offline && /could not be read/.test(s9.hostsHeldWords) && /pullShadowBody = \(s\) => require\('\.\.\/machine-mounts\.js'\)\.pullShadowBody\(s\)/.test(FSRC9) && b9.code === 'hosts-unread' && /could not be read/.test(b9.error), 'a pull mount\'s bare folder while the machines are held: the shadow carries the HOLD (its words), the files route answers it by name (hosts-unread) — never «is offline»', { s9, b9 });
  const s9x = shadow(MJ.load('src/machine-mounts.js', anchored(MSRC9, HELDRET, '    if (false) return { id: best.m.id, hostId: best.m.hostId, machine, name: machine, mountpoint: best.mp, hostsHeld: true,', 'shadow-held-cut'), 'shadow-held-cut'));
  const b9x = bodyOf(anchored(MSRC9, BODYHELD, '', 'files-held-cut'))({ ...s9 });
  ok(!!s9x && s9x.offline === true && !s9x.hostsHeld && bodyOf(MSRC9)(s9x).code === 'machine_offline' && b9x.code !== 'hosts-unread', 'CONTROLS (each cut alone, in a copy): the shadow drops the mark — the online check says «offline» for a machine that may be connected; the route without its held branch never names the hold — each RED', { s9x, b9x });
  // (a3) 主开发 19:21Z (the move's range check, wkazpjzcs): a PAIR-held record (two records on one folder — its holder answers) TOGETHER
  // with the held machines list — two meanings kept apart: the pair-held record is passed over though its machine cannot be read, and the
  // holder's row answers by the LIST's hold, under its own machine's name. B-02f6: a pair-held record now answers a WRITER under its
  // folder with its pair's hold — on ONE folder a held record answers AS ITS HOLDER (B-02f6's remainder: the tie), which is what keeps
  // this leg's answer
  const PAIRSKIP = "      if (tie && tie.kind === 'same') { const o = this._state.mounts.find((x) => x.id === tie.otherId && x.dir === 'pull'); if (o) { if (this._live.has(o.id)) return null; let known = false; try { this.hosts.get(o.hostId); known = true; } catch (e) { known = !!(e && e.code === 'hosts-unread'); } if (known) m = o; } }";
  ok(MSRC9.split(PAIRSKIP).length === 2, 'control setup: the shadow\'s tie (a held record on one folder answers as its holder) is found once');
  const pairShadow = (Mod) => {
    const M = Object.create(Mod.MachineMounts.prototype);
    Object.assign(M, { hosts: H, _state: { mounts: [{ id: 'mm-pb', dir: 'pull', hostId: 'h-0002', mountpoint: MP9 }, { id: 'mm-pa', dir: 'pull', hostId: 'h-0001', mountpoint: MP9 }] }, _live: new Map(), _realMp: new Map(), _held: new Map([['mm-pb', { kind: 'same', otherId: 'mm-pa', words: 'held' }]]), _bare: new Map() });
    return M.shadowedBy(path.join(MP9, 'notes.md'), { writer: true });
  };
  const ps = pairShadow(require(path.join(ROOT, 'src/machine-mounts.js')));
  const psx = pairShadow(MJ.load('src/machine-mounts.js', anchored(MSRC9, PAIRSKIP, '', 'shadow-pairskip-cut'), 'shadow-pairskip-cut'));
  const pb = ps ? bodyOf(MSRC9)(ps) : {};
  ok(!!ps && ps.id === 'mm-pa' && ps.hostsHeld === true && !ps.offline && pb.code === 'hosts-unread' && pb.error.startsWith('“h-0001”’s folder: '), 'a pair-held record beside the held machines list: the pair-held record is passed over (its holder answers) and the holder\'s row is refused by the LIST\'s hold, under its own machine — the two holds never mix', { ps, pb });
  ok(!!psx && psx.id === 'mm-pb', 'CONTROL (the tie cut, in a copy): the pair-held record answers for its holder\'s folder (another machine named) — RED', psx);
  // (a2) the restack meets line 244: the PAIR check (two records on one folder) WAITS while the machines list is held — every record read
  // «gone» there and every pair hold was dropped; the current holds stand, judged once the list reads (keyed whenRead)
  const PAIRW = "    if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) {";
  const pairs = async (Mod) => {
    const M = Object.create(Mod.MachineMounts.prototype), waited = [];
    const hosts = Object.create(H); hosts.whenRead = (fn, what, key) => waited.push(key);
    const a = { id: 'mm-pa', dir: 'pull', hostId: 'h-0001', mountpoint: MP9 }, b = { id: 'mm-pb', dir: 'pull', hostId: 'h-0001', mountpoint: MP9 };
    Object.assign(M, { hosts, log() { }, _notify() { }, _resolveReals: async () => { }, _realMp: new Map(), _live: new Map(), _mounting: new Set(), _state: { mounts: [a, b] }, _held: new Map([['mm-pb', { kind: 'same', otherId: 'mm-pa', words: 'held' }]]) });
    await M._recheckPairs().catch(() => null);
    return { kept: M._held.has('mm-pb'), waited: waited.join() };
  };
  ok(MSRC9.split(PAIRW).length === 2, 'control setup: the pair check\'s held wait is found once');
  const pw = await pairs(require(path.join(ROOT, 'src/machine-mounts.js'))), pwx = await pairs(MJ.load('src/machine-mounts.js', anchored(MSRC9, PAIRW, '    if (false) {', 'pairs-held-cut'), 'pairs-held-cut'));
  ok(pw.kept && pw.waited === 'mounts:pairs', 'the pair check while the machines are held: the current pair hold STANDS and the check waits for the read (keyed) — never «gone» for a machine nobody could read', pw);
  ok(!pwx.kept && pwx.waited === '', 'CONTROL (the wait cut, in a copy): every record reads «gone» — the pair hold is DROPPED (two records on one folder may both mount) — RED', pwx);
  // (a4) 主开发 19:21Z: WEBDAV's door (src/webdav.js — a PUT / a MKCOL into a machine's pull folder that is not mounted) over the same held
  // list: the REAL handler, the REAL pull door (registerPullDoor) — 503 in the HOLD's words, nothing lands; CONTROL (the door's line cut,
  // in a copy of src/webdav.js): the MKCOL lands in the bare folder
  const WSRC9 = fs.readFileSync(path.join(ROOT, 'src/webdav.js'), 'utf8');
  const DAVDOOR = "    if (req.method === 'PUT' || req.method === 'MKCOL') { const w = await pullRefusal(target); if (w) return res.status(503).type('text/plain').send(w); }\n";
  ok(WSRC9.split(DAVDOOR).length === 2, 'control setup: WebDAV\'s pull door is found once');
  fs.mkdirSync(MP9, { recursive: true });   // the bare folder (the pull is not mounted)
  const DR9 = fs.realpathSync(path.dirname(MP9)), DMP9 = path.join(DR9, 'box');   // the share's root as WebDAV's chroot sees it (a scratch dir under a link)
  const MM9 = require(path.join(ROOT, 'src/machine-mounts.js'));
  const davM = Object.create(MM9.MachineMounts.prototype);
  Object.assign(davM, { hosts: H, _state: { mounts: [{ id: 'mm-p1', dir: 'pull', hostId: 'h-0001', mountpoint: DMP9 }] }, _live: new Map(), _realMp: new Map(), _held: new Map(), _bare: new Map() });
  const dav = async (Mod, method, rel) => {
    let h = null; Mod.registerWebdav({ use: (at, fn) => { if (at === '/dav') h = fn; } }, { tokens: { resolve: () => ({ root: DR9, mode: 'rw' }) } });
    const res = { code: 0, body: '', set() { return this; }, type() { return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end() { return this; } };
    await h({ method, path: rel, headers: { authorization: 'Bearer vsmt_x' } }, res);
    return { code: res.code, body: res.body };
  };
  MM9.registerPullDoor(() => davM);
  let dv = null, dvx = null;
  try {
    const W0 = require(path.join(ROOT, 'src/webdav.js'));
    dv = { put: await dav(W0, 'PUT', '/box/notes.md'), mk: await dav(W0, 'MKCOL', '/box/newdir') };
    dv.landed = fs.existsSync(path.join(DMP9, 'notes.md')) || fs.existsSync(path.join(DMP9, 'newdir'));
    dvx = await dav(MJ.load('src/webdav.js', anchored(WSRC9, DAVDOOR, '', 'dav-door-cut'), 'dav-door-cut'), 'MKCOL', '/box/newdir');
    dvx.landed = fs.existsSync(path.join(DMP9, 'newdir'));
  } finally { MM9.registerPullDoor(null); try { fs.rmSync(path.join(DMP9, 'newdir'), { recursive: true, force: true }); } catch { } }
  ok(dv.put.code === 503 && dv.mk.code === 503 && dv.put.body.startsWith('“h-0001”’s folder: ') && /could not be read/.test(dv.put.body) && dv.mk.body === dv.put.body && !dv.landed, 'WebDAV\'s door while the machines are held: a PUT and a MKCOL into the pull folder are refused 503 in the HOLD\'s words (the files route\'s one spelling) — nothing lands', dv);
  ok(dvx.code === 201 && dvx.landed, 'CONTROL (WebDAV\'s door line cut, in a copy): the MKCOL lands in the bare folder — stranded under the next mount — RED', dvx);
  // (b) GET /api/hosts/:id/public-key while held: the route's own handler over the REAL held HostManager
  const ESRC9 = fs.readFileSync(path.join(ROOT, 'src/server/exit-routes.js'), 'utf8');
  const PKCATCH = "  catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.code === 'hosts-unread' ? { code: e.code } : {}) }); }";
  const handlerOf = (src) => { const i = src.indexOf("app.get('/api/hosts/:id/public-key', async (req, res) => {"), j = src.indexOf('\n});\n', i); return new Function('hosts', 'personVerdict', src.slice(i, j + 4).replace("app.get('/api/hosts/:id/public-key', ", 'return ('))(H, () => ({ ok: true })); };   // eslint-disable-line no-new-func
  const call9 = async (src) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = { status: this.code, ...b }; return this; } }; await handlerOf(src)({ params: { id: 'h-0001' }, headers: {} }, res); return out; };
  const k9 = await call9(ESRC9), k9x = await call9(anchored(ESRC9, PKCATCH, '  catch (e) { res.status(400).json({ error: e.message }); }', 'public-key-held-cut'));
  ok(!!k9 && k9.status === 503 && k9.code === 'hosts-unread' && !!k9x && k9x.status === 400 && !k9x.code, 'a machine\'s public key while held: 503 with the hold\'s name (hosts-unread); CONTROL (the bare 400 put back, in a copy): «400» with no name — RED', { k9, k9x });
  if (!asRoot9) { try { fs.chmodSync(HF, 0o600); } catch { } }
}

// ── §10 主开发 02:31Z (the move check's ruling): THE TWO ROADS of the boot's resume line, DRIVEN on the held-then-read road. A LOCAL
// resume waits for nothing of the hosts store; a REMOTE resume never runs before the boot's re-adoption of the machines' left-running
// conversations has SETTLED — held, then read, then re-adopting over ssh (seconds) included. A REAL held HostManager; the server's
// re-adoption line and the wiring's two-roads gate compiled from their sources; the re-adoption a stand-in that settles when told
console.log('§10 the boot\'s two resume roads over a held-then-read hosts.json (the re-adoption window driven), and its wait never let go in silence');
{
  const D10 = scratch('hosts-held-census-10'); fs.rmSync(D10, { recursive: true, force: true }); fs.mkdirSync(D10, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(D10, { recursive: true, force: true }); } catch { } });
  const asRoot10 = typeof process.getuid === 'function' && process.getuid() === 0;
  const hb10 = JSON.stringify({ hosts: [{ id: 'h-0001', name: 'build-box', transport: 'dial', deviceId: 'build-box' }] });
  const held10 = (name) => { const d = path.join(D10, name); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, 'hosts.json'); if (asRoot10) fs.mkdirSync(f); else { fs.writeFileSync(f, hb10); fs.chmodSync(f, 0o000); }
    return { d, f, read: () => { if (asRoot10) { fs.rmdirSync(f); fs.writeFileSync(f, hb10); } else fs.chmodSync(f, 0o600); } }; };
  const HM10 = require(path.join(ROOT, 'src/hosts.js')).HostManager;
  const SRV10 = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), WIRE10 = fs.readFileSync(path.join(ROOT, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const lineOf = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('not found: ' + head); return src.slice(i, src.indexOf('\n', i)); };
  const READOPT = "  setTimeout(() => { const go = () => Promise.resolve().then(() => readoptOrphanKeeperSessions())";
  const bootOf = (srv) => { const ln = lineOf(srv, READOPT), a = ln.indexOf('setTimeout(() => { ') + 'setTimeout(() => { '.length, b = ln.lastIndexOf(' }, 8000);'); return new Function('hosts', 'resumeRoad', 'readoptOrphanKeeperSessions', 'console', ln.slice(a, b)); };   // eslint-disable-line no-new-func
  const gateOf = (wire, deliver = null) => new Function('deliver', `let adoptedNow = null; ${lineOf(wire, 'let remoteSettled = false;')}\n${lineOf(wire, 'const REMOTE_READOPT_WORDS = ')}\n${lineOf(wire, 'const resumeRoad = { reopen: null, kept: null, adopted:')}\n${lineOf(wire, 'const reopenRoads = ')}\nreturn { resumeRoad, reopenRoads, openLocal: new Promise((r) => { adoptedNow = r; }) };`)(deliver);   // eslint-disable-line no-new-func
  const quiet = { warn: () => { }, log: () => { } }, tick = () => new Promise((r) => setTimeout(r, 5));
  const road = async (wire, srv) => {
    const st = held10('road-' + Math.random().toString(36).slice(2, 8)), H = new HM10({ dataDir: st.d });
    const g = gateOf(wire), calls = [];
    g.resumeRoad.reopen = async (item) => { calls.push(item && item.hostId ? 'remote' : 'local'); return { ok: true }; };
    let settle = null, started = 0; const readopt = () => { started++; return new Promise((r) => { settle = r; }); };
    let localOpen = false; g.openLocal.then(() => { localOpen = true; });
    bootOf(srv)(H, g.resumeRoad, readopt, quiet);
    await tick();
    const out = { held: H.held(), localOpen };
    out.heldRemote = (await g.reopenRoads({ sessionKey: 'claude:r1', hostId: 'h-0001' })).code || 'ran';
    out.heldLocal = (await g.reopenRoads({ sessionKey: 'claude:l1' })).ok === true;
    st.read(); await H.readAgain(); await tick();   // the store reads again: the queued re-adoption starts (over ssh: seconds) — 2b: the helper's read again
    out.readoptStarted = started;
    out.windowRemote = (await g.reopenRoads({ sessionKey: 'claude:r2', hostId: 'h-0001' })).code || 'ran';   // submitted IN the window
    out.remoteBeforeSettle = calls.filter((c) => c === 'remote').length;
    if (settle) settle(); await tick(); await tick();
    out.afterRemote = (await g.reopenRoads({ sessionKey: 'claude:r3', hostId: 'h-0001' })).ok === true;
    out.calls = calls.join();
    return out;
  };
  const GATE = 'item && item.hostId && !remoteSettled ? ';
  ok(WIRE10.split(GATE).length === 2 && SRV10.split(READOPT).length === 2, 'control setup: the two-roads gate and the boot\'s re-adoption line are found once');
  const rd = await road(WIRE10, SRV10), rdx = await road(anchored(WIRE10, GATE, 'false ? ', 'two-roads-gate-cut'), SRV10);
  ok(rd.held && rd.localOpen && rd.heldRemote === 'readopt-pending' && rd.heldLocal && rd.readoptStarted === 1 && rd.windowRemote === 'readopt-pending' && rd.remoteBeforeSettle === 0 && rd.afterRemote && rd.calls === 'local,remote',
    'the boot over a HELD hosts.json: the LOCAL road opens at once (a local resume runs); a REMOTE resume is refused by name while held AND in the window after the read while the re-adoption runs — never run before it settles; once it settles the remote road opens', rd);
  ok(rdx.windowRemote === 'ran' && rdx.remoteBeforeSettle > 0, 'CONTROL (the two-roads gate cut, in a copy of the wiring): a remote resume submitted in the window RUNS before the re-adoption settled — it could end the agent the re-adoption would adopt — RED', rdx);
  // its readers' should: the NEVER-HELD road run too (a boot whose hosts.json reads at once): both roads open only in the re-adoption's
  // finally — a local resume waits for it as before (piece 4's must 5), a remote one too; once it settles both run
  const never = async () => {
    const d = path.join(D10, 'never'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'hosts.json'), hb10);
    const H = new HM10({ dataDir: d }), g = gateOf(WIRE10), calls = [];
    g.resumeRoad.reopen = async (item) => { calls.push(item && item.hostId ? 'remote' : 'local'); return { ok: true }; };
    let settle = null; const readopt = () => new Promise((r) => { settle = r; });
    let localOpen = false; g.openLocal.then(() => { localOpen = true; });
    bootOf(SRV10)(H, g.resumeRoad, readopt, quiet); await tick();
    const out = { held: H.held(), localOpenBefore: localOpen, remoteBefore: (await g.reopenRoads({ sessionKey: 'claude:n1', hostId: 'h-0001' })).code || 'ran' };
    if (settle) settle(); await tick(); await tick();
    out.localOpenAfter = localOpen; out.remoteAfter = (await g.reopenRoads({ sessionKey: 'claude:n2', hostId: 'h-0001' })).ok === true; out.calls = calls.join();
    return out;
  };
  const nv = await never();
  ok(nv.held === false && nv.localOpenBefore === false && nv.remoteBefore === 'readopt-pending' && nv.localOpenAfter === true && nv.remoteAfter && nv.calls === 'remote',
    'the NEVER-HELD road: both roads stay shut while the re-adoption runs (the local line opens in its finally, as piece 4 made it; a remote resume refused by name) and open once it settles', nv);
  // the re-adoption's wait is KEPT past the store's bound of waits (a wait let go was only a log line: the left-running remote
  // conversations were never adopted until the next start, and the remote road never opened)
  const LETGO = "{ onLetGo: () => { console.warn('[readopt] the re-adoption keeps its place in the waits for hosts.json (it runs at the read; remote resumes are refused until it settles)'); keep(); } }";
  ok(SRV10.split(LETGO).length === 2, 'control setup: the re-adoption\'s let-go answer is found once');
  const flood = async (srv) => {
    const st = held10('flood-' + Math.random().toString(36).slice(2, 8)), H = new HM10({ dataDir: st.d }), g = gateOf(WIRE10);
    g.resumeRoad.reopen = async () => ({ ok: true });
    bootOf(srv)(H, g.resumeRoad, () => Promise.resolve(), quiet);
    const warn = console.warn; console.warn = () => { };
    try { for (let i = 0; i < 300; i++) H.whenRead(() => { }, `another wait ${i}`, `w${i}`); } finally { console.warn = warn; }
    return { kept: !!(H._readWaits && H._readWaits.has('boot:readopt')), waits: H._readWaits ? H._readWaits.size : 0 };
  };
  const fl = await flood(SRV10), flx = await flood(anchored(SRV10, LETGO, '{}', 'readopt-let-go-cut'));
  ok(fl.kept, 'the re-adoption\'s wait keeps its place past the store\'s bound of 256 waits (let go, it queues itself again, said) — it runs at the read, the remote road opens after it', fl);
  ok(!flx.kept, 'CONTROL (its let-go answer cut, in a copy of server.js): 300 other waits let the re-adoption go — the left-running remote conversations are never adopted until the next start, the remote road never opens — RED', flx);
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'hosts-held-census ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
