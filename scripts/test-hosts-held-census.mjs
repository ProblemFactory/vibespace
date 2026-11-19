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
import { scratch } from './scratch.mjs';
import * as acorn from 'acorn';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const LOOKUP = /\b(?:hosts|_hosts|getHosts)(?:\?\.)?(?:\(\))?\??\.(?:get|list|findByDeviceId)\??\.?\(|\bthis\.(?:get|list|findByDeviceId)\(/g;
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
console.log('§1 every caller of a lookup (get / list / findByDeviceId) in the server is a row');
{
  const ROWS = [
    {"file": "server.js", "at": "const hostTokens = require('./src/server/host-tokens.js').create({ dataDir: path.join(__dirname,", "n": 2, "cls": "harmless", "why": "hostTokens.create({nameOf}) (findByDeviceId / get) — Bare catch (host-tokens) hides the hold, harmlessly (a display name). findByDeviceId learn held: no"},
    {"file": "server.js", "at": "const h = hosts.get(hostId);", "n": 2, "cls": "harmless", "why": "a usage push / an ssh device's connect needs a live remote link — unreachable while held (every connect meets the hold first)", "bare": "unreachable while held (an ssh device connected / a usage push needs a live link); a removed machine: nothing to do"},
    {"file": "server.js", "at": "const out = await graduateHostToDial(hosts.get(hostId), { by: 'system:graduate' });", "n": 1, "cls": "harmless", "why": "armed only by an ssh device's connect — unreachable while held"},
    {"file": "server.js", "at": "const hostName = s.host ? (() => { try { return hosts.get(s.host)?.name || s.host; } catch { ret", "n": 1, "cls": "harmless", "why": "sessionAuth hostName — Display"},
    {"file": "server.js", "at": "access: () => desktopAccess, hostLabel: (h) => { try { return hosts.get(h).name || h; } catch { ", "n": 1, "cls": "harmless", "why": "desktopKeeper hostLabel — Display"},
    {"file": "server.js", "at": "remoteHosts: () => { try { return hosts.list().filter((h) => (h.transport === 'dial' ? h.online ", "n": 1, "cls": "harmless", "why": "the desktop keeper's boot adoption list — while held it asks none; each machine meets desktop-access notHeld (host_unavailable, kept offline) and the tick asks again after the read", "bare": "held: an empty list adopts nothing and drops nothing (the records stay)"},
    {"file": "server.js", "at": "try { machineMounts.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "harmless", "why": "dial-in accepted: unreachable while held — the dial gate answers every dial 503 (holdDial)", "bare": "unreachable while held; a removed machine: nothing to link"},
    {"file": "server.js", "at": "try { portForwards.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "harmless", "why": "dial-in accepted: unreachable while held — the dial gate answers every dial 503 (holdDial)", "bare": "unreachable while held; a removed machine: nothing to link"},
    {"file": "src/exit-proxy.js", "at": "_hosts() { try { return this.hosts.list?.() || []; } catch { return []; } }", "n": 1, "cls": "refuses", "why": "_hosts(): listFor / _judge refuse first while held (hosts-unread 503 to the agent); pruneLists has its own held belt; GET /api/exits has no page reader", "bare": "the readers above it ask held() first; a failed list lends nothing (fail closed)"},
    {"file": "src/exit-proxy.js", "at": "_raw(hostId) { try { return this.hosts.get(hostId); } catch { return null; } }", "n": 1, "cls": "refuses", "why": "_raw(): view / setAccess refuse first while held (_refuseIfHeld, hosts-unread 503); access() / _credOk lend nothing — no forward opens while held", "bare": "the readers that name an absence refuse first; null lends nothing (fail closed)"},
    {"file": "src/exit-proxy.js", "at": "try { const h = this.hosts.get(hostId); lastRun = h ? (this.accessOf(h).lastRun || null) : null;", "n": 1, "cls": "harmless", "why": "_rowRecorded: needs a recorded run — unreachable while held (no run can start)", "bare": "a run's last-run stamp only — nothing judged on it"},
    {"file": "src/hosts.js", "at": "const h = this.get(id);", "n": 27, "cls": "refuses", "why": "every method that opens with this.get(id): accountsStatus, renameHostSubDir, cliPrimaryKey, test, killRemotePid, reachable, refuseUnreachable, dirComplete, dirSlice, back"},
    {"file": "src/hosts.js", "at": "const h = this.findByDeviceId(deviceId);", "n": 2, "cls": "harmless", "why": "onDialIn / noteDial: a dialed-in device — unreachable while held (holdDial); findByDeviceId throws hosts-unread there by name"},
    {"file": "src/hosts.js", "at": "let h = this.findByDeviceId(deviceId);", "n": 1, "cls": "refuses", "why": "setDialToken: a writer — refused by name while held (_refuseIfUnread before it); findByDeviceId throws hosts-unread"},
    {"file": "src/hosts.js", "at": "if (!h) { this.add({ name: name || deviceId, transport: 'dial', deviceId }); h = this.findByDevi", "n": 1, "cls": "refuses", "why": "setDialToken: a writer — refused by name while held (_refuseIfUnread before it)"},
    {"file": "src/hosts.js", "at": "dialTokenHash(deviceId) { return this.findByDeviceId(deviceId)?.dialTokenHash || null; }", "n": 1, "cls": "refuses", "why": "dialTokenHash: «is it paired» — throws hosts-unread while held (findByDeviceId); its one live caller (the dial gate) holds the dial first"},
    {"file": "src/hosts.js", "at": "try { const h = hostId === 'local' ? null : this.get(hostId); if (h) machine = h.name || h.id; }", "n": 1, "cls": "harmless", "why": "a dialed-in device's act / policy facts — unreachable while held (every dial is held off); a display name otherwise", "bare": "a machine's display name in an act line — its id meanwhile"},
    {"file": "src/hosts.js", "at": "let h = null; try { h = this.get(hostId); } catch { return false; }", "n": 3, "cls": "harmless", "why": "noteAct / notePolicy / noteElevated / noteRuntime: a dialed-in device's facts — unreachable while held", "bare": "unreachable while held; a removed machine records nothing"},
    {"file": "src/hosts.js", "at": "const cur = this.findByDeviceId(rec.deviceId);", "n": 1, "cls": "refuses", "why": "importBundle: refused while held before it (skipped, the warning says why)"},
    {"file": "src/hosts.js", "at": "if (!v.ok) throw unreachableError(this.get(id), v.line);", "n": 1, "cls": "refuses", "why": "refuseUnreachable: get throws hosts-unread by name while held"},
    {"file": "src/hosts.js", "at": "const h = this.get(hostId);", "n": 1, "cls": "refuses", "why": "opencodeOp: get throws hosts-unread by name while held (the op refuses)"},
    {"file": "src/hosts.js", "at": "let h; try { h = this.get(id); } catch { return 'unknown'; }   // ALSO CURED: a removed machine'", "n": 1, "cls": "refuses", "why": "linkState: held answers «offline» first (the pool's dark-source defense stays on) — H3", "bare": "a removed machine is «unknown» (it threw, and one removed source emptied the whole dark list — ALSO CURED)"},
    {"file": "src/hosts.js", "at": "try { return this.convIndex.ownerHost(sessionId, (hid) => { if (this._unread) return true; try {", "n": 1, "cls": "waits", "why": "conversationOwner: held keeps every claim («unknown», never «gone»)", "bare": "a removed machine's claim is FILTERED (ALSO CURED: it threw inside the filter)"},
    {"file": "src/incident.js", "at": "const h = hosts.get?.(hid) || (hosts.list?.() || []).find((x) => x.id === hid);", "n": 2, "cls": "refuses", "why": "the incident report's machine probe: get throws hosts-unread by name — the row reads that error"},
    {"file": "src/machine-mounts.js", "at": "hostId: (this.hosts.held?.() ? null : this.hosts.findByDeviceId?.(m.deviceId)?.id) || (/^grad-/.", "n": 1, "cls": "harmless", "why": "_migrateLegacy (a legacy file from before 2.160.0): while held no device is looked up — the key is derived as the pairing minted it (grad-<host id> / host-dial-<id>), and the one-time ingest runs (H10)"},
    {"file": "src/machine-mounts.js", "at": "const h = this.hosts.get(hostId);", "n": 3, "cls": "waits", "why": "_online / the restore / the health sweep: while held a machine reads offline (shown, a heal tried again later) — no record is changed on it", "bare": "_online / the restore / the health sweep: false = offline (a display, a heal tried later); every change refuses the hold by name before it"},
    {"file": "src/machine-mounts.js", "at": "const dial = (() => { try { return this.hosts.get(hostId).transport === 'dial'; } catch { return", "n": 1, "cls": "harmless", "why": "_davBase dial check: unreachable while held (a mount's road needs its machine, which refuses first)", "bare": "false = the ssh road, which then meets the hold by name"},
    {"file": "src/machine-mounts.js", "at": "const mName = (() => { try { return this.hosts.get(pull.hostId)?.name || pull.hostId; } catch { ", "n": 1, "cls": "harmless", "why": "a refusal's words name the machine by its id meanwhile"},
    {"file": "src/machine-mounts.js", "at": "const h = this.hosts.get(hostId); // throws for unknown machine", "n": 1, "cls": "refuses", "why": "_mountPullInner: get throws hosts-unread by name — the pull mount is refused"},
    {"file": "src/port-forward.js", "at": "try { all = (this.hosts.list?.() || []); } catch { return; }", "n": 1, "cls": "harmless", "why": "the forwards' watch sweep: an empty list sweeps nothing (no forward is dropped)", "bare": "held: nothing to sweep this tick; it runs again"},
    {"file": "src/remote-fs.js", "at": "try { dial = this.hosts.get(id)?.transport === 'dial'; } catch { }", "n": 1, "cls": "refuses", "why": "remote-fs _dev dial check: the next step (_host) throws hosts-unread by name", "bare": "false = the ssh road, which meets the hold by name"},
    {"file": "src/remote-fs.js", "at": "_host(id) { return this.hosts.get(id); }", "n": 1, "cls": "refuses", "why": "remote-fs _host: get throws hosts-unread by name — every remote file operation refuses it (routes/files.js answers the words)"},
    {"file": "src/routes/persistence.js", "at": "hosts: (getHosts?.()?.list?.() || []).length, hostsUnread: (getHosts?.()?.held?.() && getHosts()", "n": 1, "cls": "refuses", "why": "the export preview: the count and the hold's words (hostsUnread) — the page says it, never «no hosts configured» (H15); an export that asks for machines is refused 503"},
    {"file": "src/server/account-usage-routes.js", "at": "try { hostName = ev.host ? (hosts.get(ev.host)?.name || null) : null; } catch { }", "n": 1, "cls": "harmless", "why": "the usage-event popup's machine name — an id shows meanwhile", "bare": "display only"},
    {"file": "src/server/account-usage-routes.js", "at": "try { out.hostNames = Object.fromEntries((hosts.list?.() || []).map((h) => [h.id, h.name || h.id", "n": 1, "cls": "harmless", "why": "GET /api/accounts hostNames — ids show meanwhile", "bare": "display only"},
    {"file": "src/server/account-usage-routes.js", "at": "const facts = { ...r, hostId: req.params.id, transport: hosts.get(req.params.id)?.transport === ", "n": 1, "cls": "refuses", "why": "the per-host verdicts run after the route's first lookup, which refuses the hold by name", "bare": "the route's first lookup (accountsStatus) refuses the hold by name; this verdict pass runs only after it answered"},
    {"file": "src/server/account-usage-routes.js", "at": "const hostName = (() => { try { return hosts.get(req.body?.hostId)?.name; } catch { return null;", "n": 1, "cls": "harmless", "why": "the CLI login import's machine name — an id shows meanwhile", "bare": "display only"},
    {"file": "src/server/account-usage-routes.js", "at": "const sweep = () => { for (const h of hosts.list() || []) { try { ", "n": 2, "cls": "waits", "why": "an account delete's remote folder sweep waits for the read (whenRead)", "bare": "one machine unreachable: the sweep goes on to the next"},
    {"file": "src/server/artifact-registry.js", "at": "for (const id of new Set(ids.map((x) => String(x || '')).filter((x) => x && x !== 'local'))) { l", "n": 1, "cls": "harmless", "why": "artifact rows' machine names — ids show meanwhile", "bare": "display only"},
    {"file": "src/server/boot-restore.js", "at": "const h = hosts.get?.(meta.host);", "n": 1, "cls": "waits", "why": "the boot's re-adoption of remote sessions left running WAITS for the read (whenRead) — it ended the boot's one pass and a later resume killed the agent it would adopt"},
    {"file": "src/server/browser-access.js", "at": "try { return !!hosts.get(hostId); } catch { return false; }", "n": 1, "cls": "refuses", "why": "browser-access hostKnown: its readers ask machinesHeld() first (host_unavailable by name — H9, H25)", "bare": "its readers ask the hold first; false here is «not this machine» only after them"},
    {"file": "src/server/conversation-deliver.js", "at": "const hid = idx.ownerHost(cid, (id) => { try { return !!hosts.get(id); } catch (e) { return !!(e", "n": 1, "cls": "waits", "why": "the delivery's owner question: held keeps the claim — the remote rung meets the hold by name and the stash keeps the message (never «not running», H2)"},
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
    {"file": "src/server/dial-pairing.js", "at": "try { await machineMounts.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "refuses", "why": "unpairDialDevice: refused by name while held (its belt) — no half teardown", "bare": "after the belt: a removed machine's parts"},
    {"file": "src/server/dial-pairing.js", "at": "try { portForwards.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }", "n": 1, "cls": "refuses", "why": "unpairDialDevice: refused by name while held (its belt)", "bare": "after the belt: a removed machine's parts"},
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
    {"file": "src/server/exit-routes.js", "at": "const h = hosts.get(req.params.id);", "n": 1, "cls": "refuses", "why": "DELETE /api/hosts/:id: refused 503 hosts-unread BEFORE the lookup (the unpair teardown never runs)"},
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
    {"file": "src/server/task-groups-wiring.js", "at": "if (!home) { try { hosts().homeDir(hosts().get(session.host)); } catch { } return null; } // war", "n": 1, "cls": "harmless", "why": "the remote context base warm-up — warmed later", "bare": "a cache warm-up only"},
    {"file": "src/spawn/ssh.js", "at": "const h2 = hosts.get(data.hostId);", "n": 1, "cls": "harmless", "why": "the tools' ship for a create already past its own lookup (which refuses by name)"},
    {"file": "src/usage-routes.js", "at": "const want = req.body?.host ? [req.body.host] : hosts.list().map((h) => h.id);", "n": 1, "cls": "waits", "why": "an empty list harvests nothing this round; asked again later — nothing is judged on an absence"},
    {"file": "src/usage-routes.js", "at": "let hMeta2; try { hMeta2 = hosts.get(hid); } catch (e) { return e && e.code === 'hosts-unread' ?", "n": 1, "cls": "refuses", "why": "the per-machine usage ⟳: 503 hosts-unread by name — never «unknown host» (H20)"},
    {"file": "src/usage-routes.js", "at": "let hMeta; try { hMeta = hosts.get(hid); } catch (e) { return e && e.code === 'hosts-unread' ? r", "n": 1, "cls": "refuses", "why": "the per-machine usage ⟳: 503 hosts-unread by name — never «unknown host» (H20)"},
    {"file": "src/usage-routes.js", "at": "for (const h of hosts?.list() || []) out[h.id] = { ...(_hostUsage[h.id] || {}), name: h.name };", "n": 1, "cls": "harmless", "why": "a usage snapshot for display — no machine rows meanwhile"},
    {"file": "src/writer-sweep.js", "at": "const h = hosts.get(hostId);", "n": 1, "cls": "refuses", "why": "the writer sweep's ssh fallback: get throws hosts-unread by name (the resume refuses first)"},
    {"file": "src/ws-create.js", "at": "if (hosts.get(hd) && fs.existsSync(path.join(cacheRoot, hd, cacheRel))) owners.push(hd);", "n": 1, "cls": "refuses", "why": "the host-less resume: refused by name while held BEFORE the cache scan — never resumed on this machine (H4)", "bare": "the held check refuses the resume by name BEFORE this scan (H4); after it, a removed machine owns nothing"},
    {"file": "src/ws-create.js", "at": "try { const hh = hosts.get(data.hostId); cwd = (hh && await hosts.homeDir(hh)) || ''; } catch { ", "n": 1, "cls": "harmless", "why": "a remote create's default folder — the create meets the hold by name next", "bare": "the create refuses right after it"},
    {"file": "src/ws-create.js", "at": "const hh = hosts.get(data.hostId);", "n": 3, "cls": "harmless", "why": "the cwd preflight never blocks a create; the create meets the hold by name next (its own lookup)", "bare": "the cwd preflight never blocks a create; the create meets the hold by name next (its own lookup, H16)"},
    {"file": "src/ws-create.js", "at": "const facts = { ...rs, hostId: data.hostId, transport: spawnFor(hosts.get(data.hostId) || {}).id", "n": 2, "cls": "harmless", "why": "account facts for a create already past its lookup (which refuses by name)", "bare": "account facts for a create already past its lookup (which refuses the hold by name)"},
    {"file": "src/ws-create.js", "at": "try { h = hosts.get(data.hostId); }", "n": 2, "cls": "refuses", "why": "a remote create / resume: the hold's code and translated words — never «Unknown host» (H16)"},
    {"file": "src/ws-handler.js", "at": "const h = hosts.get(session.host);", "n": 1, "cls": "waits", "why": "Terminate of a remote conversation: said unconfirmed by name, the remote stop OWED and run at the read (whenRead) — H1", "bare": "the remote stop runs only when the list is READ (while held it is said and owed at the read, H1); a failed remote stop after that is best-effort, as the release"},
  ];
  const SITE = /\b(?:hosts|_hosts|getHosts)(?:\?\.)?(?:\(\))?\??\.(?:get|list|findByDeviceId)\??\.?\(/g, SELF = /\bthis\.(?:get|list|findByDeviceId)\(/g;
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
  const held = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; H._unread = { code: 'EACCES' }; return H; };
  const codeOf = (fn) => { try { const v = fn(); return v === null || v === undefined ? 'absent' : 'answered'; } catch (e) { return e && e.code; } };
  const H = held(require(path.join(ROOT, 'src/hosts.js')));
  const l = H.list();
  ok(codeOf(() => H.get('h-0001')) === 'hosts-unread' && codeOf(() => H.findByDeviceId('dev-0001')) === 'hosts-unread' && codeOf(() => H.dialTokenHash('dev-0001')) === 'hosts-unread',
    'get, findByDeviceId («is it paired») and dialTokenHash throw hosts-unread (503, the hold\'s words) while held');
  ok(Array.isArray(l) && l.length === 0 && typeof l.held === 'string' && /could not be read/.test(l.held) && JSON.stringify(l) === '[]' && H.held() === true,
    'list() while held is empty AND carries the hold\'s words (`held`, not enumerated: the JSON is unchanged); held() says so', { held: l.held });
  const HX = held(MJ.load('src/hosts.js', HSRC.replace(FIND, '    // Pure-dial first'), 'find-no-held'));
  ok(codeOf(() => HX.findByDeviceId('dev-0001')) === 'absent', 'CONTROL (findByDeviceId\'s held line cut, in a copy): «is it paired» answers ABSENT on a held list');
}

// ── §2 the page reads the hold (client) ────────────────────────────────────────────────────────────────────────────────────────
console.log('§2 the page reads the hold — a list that arrives with the hold\'s mark is never cached as a roster');
{
  const WB = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-workbench.js'), 'utf8');
  const slice = (src, head) => { const i = src.indexOf(head); if (i < 0) return null; const j = src.indexOf('\n    },\n', i); return j < 0 ? null : src.slice(i, j + 7); };   // through the method's comma
  const HELDLINE = "        if (d.unread) { this._hostsHeld = true; this._hostsDataFailAt = Date.now(); return; }\n";
  ok(WB.split(HELDLINE).length === 2, 'control setup: the anchor of the control «a held list is no roster» is in sidebar-workbench.js');
  const sidebarOf = (src) => {
    const a = slice(src, '    _ensureHostsData() {'), b = slice(src, '    _wbValidHost(id, storageKey, memKey) {');
    if (!a || !b) return null;
    const store = new Map(), toasts = [];
    let reply = null;
    const fetchStub = async () => ({ json: async () => reply });
    const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    // eslint-disable-next-line no-new-func
    const obj = new Function('fetch', 'localStorage', 'showToast', 'tr', `return {\n${a}\n${b}\n  _render() { }\n};`)(fetchStub, ls, (m) => toasts.push(m), (s) => s);
    return { obj, store, toasts, answer: (r) => { reply = r; } };
  };
  const scene = async (src, rep) => {
    const S = sidebarOf(src); if (!S) return null;
    S.store.set('wbRecentHost', 'h-0001'); S.obj._wbRecentHost = 'h-0001';
    S.answer(rep);
    S.obj._ensureHostsData();
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const kept = S.obj._wbValidHost('h-0001', 'wbRecentHost', '_wbRecentHost');
    return { cached: Array.isArray(S.obj._hostsData && S.obj._hostsData.hosts), held: !!S.obj._hostsHeld, kept, stored: S.store.get('wbRecentHost'), toasts: S.toasts.length };
  };
  const HELD = { hosts: [], key: { exists: false }, unread: 'hosts.json in VibeSpace\'s data folder could not be read (EACCES)' };
  const GONE = { hosts: [], key: { exists: false } };
  const h = await scene(WB, HELD), g = await scene(WB, GONE);
  const hx = await scene(WB.replace(HELDLINE, '        /* MUTANT: a held list cached as the roster */\n'), HELD);
  ok(h && !h.cached && h.held && h.kept === 'h-0001' && h.stored === 'h-0001' && h.toasts === 0,
    'a HELD machines list is not cached: the person\'s Recent machine pick is KEPT (in memory and stored), no «no longer exists» toast', h);
  ok(g && g.cached && g.kept === '' && g.stored === '' && g.toasts === 1, 'the plant: a list READ empty (the machine really removed) still heals the pick back to Local, once, said', g);
  ok(hx && hx.cached && hx.kept === '' && hx.stored === '' && hx.toasts === 1, 'CONTROL (the held check cut, in the source): the held list is cached — the pick is wiped and «no longer exists» is toasted', hx);
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
    H._unread = held ? { code: 'EACCES' } : null;
    H.convIndex = idx;
    return H.conversationOwner('conv-1');
  };
  const live = ownerOf(require(path.join(ROOT, 'src/hosts.js')), { held: false });
  ok(live === 'h-0001', 'a removed machine\'s old claim is FILTERED (one live claim answers — it made the whole answer null: ALSO CURED)', live);
  // while held, BOTH claims stand (the index cannot be judged) ⇒ ambiguous here by the stub's rule; a single claim answers itself
  const one = { ownerHost(sid, isReg) { return isReg('h-0001') ? 'h-0001' : null; } };
  const heldOwner = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; H._unread = { code: 'EACCES' }; H.convIndex = one; return H.conversationOwner('conv-1'); };
  const h = heldOwner(require(path.join(ROOT, 'src/hosts.js')));
  const hx = heldOwner(MJ.load('src/hosts.js', HSRC.replace(KEEP, '(hid) => !!this.get(hid)'), 'owner-no-held'));   // stale-pins: kept (the control plants the release's text in a copy)
  ok(h === 'h-0001' && hx === null, 'hosts.conversationOwner on a HELD list keeps the conversation\'s claim; CONTROL (the release\'s filter, in a copy): null — the conversation reads as on no machine', { h, hx });

  const CD = fs.readFileSync(path.join(ROOT, 'src/server/conversation-deliver.js'), 'utf8');
  const head = '  function ownerHostOf(cid) {\n', i = CD.indexOf(head), j = i < 0 ? -1 : CD.indexOf('\n  }\n', i);
  const fn = i < 0 || j < 0 ? null : CD.slice(i, j + 4);
  const CATCH = "catch (e) { return !!(e && e.code === 'hosts-unread'); } });";
  ok(!!fn && fn.split(CATCH).length === 2, 'control setup: ownerHostOf is sliced from conversation-deliver.js and carries the held catch (the control\'s anchor)');
  const ownerHostOf = (src) => {
    const hosts = { get: () => { throw Object.assign(new Error('hosts.json could not be read (EACCES)'), { code: 'hosts-unread', status: 503 }); } };
    // eslint-disable-next-line no-new-func
    return new Function('getHosts', 'getConvIndex', `${src}\nreturn ownerHostOf;`)(() => hosts, () => one);
  };
  const d = fn && ownerHostOf(fn)('conv-1'), dx = fn && ownerHostOf(fn.replace(CATCH, 'catch { return false; } });'))('conv-1');
  ok(d === 'h-0001' && dx === null, 'the delivery\'s owner question on a HELD list answers the conversation\'s machine (the remote rung meets the hold by name, the stash keeps the message); CONTROL (the bare catch, in the slice): null — the local rung\'s miss says «no live inbox … not running»', { d, dx });
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
    { file: 'src/lib/sidebar-workbench.js', at: "fetch('/api/hosts').then(r => r.json()).then(d => {", n: 1, cls: 'waits', pin: 'if (d.unread) { this._hostsHeld = true; this._hostsDataFailAt = Date.now(); return; }', why: 'Recent / History machine picks: a held list is never the roster (kept, no «no longer exists»); asked again after the backoff (§2 drives it)' },
    { file: 'src/lib/toolbar-fold.js', at: "const d = await fetchJson('/api/hosts'); hostsList = d?.hosts || []; held = (d && d.unread) || null;", n: 1, cls: 'refuses', pin: '...(held ? [{ caption: t(\'Your paired machines cannot be read right now', why: 'the terminal button opens its menu with the hold\'s words — never a local shell in place of the machine meant' },
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
  const exx = await exitScene(MJ.load('src/exit-proxy.js', XSRC.replace(RH, '  _refuseIfHeld() { }').replace(JH, '').replace(PB, ''), 'exit-no-held'));
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
    Object.assign(M, { dataDir: D5, _file: path.join(D5, tag + '.json'), hosts: heldHosts, mountTokens: { revoke: (t) => revoked.push(t) }, broadcast: () => { }, log: () => { }, _live: new Map(), _pushTunnelOwned: new Map(), _pushRetryAt: new Map(), _pushDown: new Map(), _pullErrors: new Map(),
      _state: { mounts: [{ id: 'mm-1', dir: 'push', hostId: 'h-0001', tokenId: 'tok-1', method: 'rclone-webdav', mountpoint: '/mnt/x' }] } });
    const code = await codeOf(() => M.unmount('mm-1'));
    return { code, kept: M._state.mounts.length, revoked: revoked.length };
  };
  const mm = await mountScene(require(path.join(ROOT, 'src/machine-mounts.js')), 'real');
  const mmx = await mountScene(MJ.load('src/machine-mounts.js', MSRC.replace(UH, ''), 'mm-no-held'), 'mut');
  ok(mm.code === 'hosts-unread' && mm.kept === 1 && mm.revoked === 0, 'a push mount\'s removal while held is refused by name — its record and its token stay (its unmount runs ON the machine)', mm);
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
    const lgx = legacy(MJ.load('src/machine-mounts.js', MM.replace(KEY, '      hostId: this.hosts.findByDeviceId?.(m.deviceId)?.id || '), 'legacy-lookup'), 'legacy-held-mut');   // stale-pins: kept (the control plants the release's text in a copy)
    ok(lg.keys === 'host-dial-mac-1,host-1234' && lg.migrated && !lg.left, 'a HELD boot migrates the legacy pull mounts under the keys the pairing minted (host-dial-<id>, a graduated machine\'s own id) — never a wait that machine-mounts.json then ends for good', lg);
    ok(lgx.keys === '' && lgx.left, 'CONTROL (the lookup asked while held, in a copy): it throws, the pull mounts are not ingested and the legacy file stays — while machine-mounts.json is written (the one-time ingest never runs again)', lgx);
  }
  // (c) hosts.linkState while held: 'offline' — the pool's dark-source defense stays on (H3)
  const HSRC = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const LH = "    if (this._unread) return 'offline';\n    let h; try { h = this.get(id); } catch { return 'unknown'; }";
  ok(HSRC.split(LH).length === 2, 'control setup: the anchor of the linkState control is in hosts.js');
  const linkOf = (Mod) => { const H = Object.create(Mod.HostManager.prototype); H._state = { hosts: [] }; H._unread = { code: 'EACCES' }; try { return H.linkState('h-0001'); } catch (e) { return 'threw:' + (e && e.code); } };
  const lk = linkOf(require(path.join(ROOT, 'src/hosts.js')));
  const lkx = linkOf(MJ.load('src/hosts.js', HSRC.replace(LH, '    const h = this.get(id);'), 'link-no-held'));
  ok(lk === 'offline' && lkx === 'threw:hosts-unread', 'linkState while held answers «offline» (a dark source); CONTROL (the release\'s first line, in a copy): it throws — usage-pool-engine\'s darkSources swallowed it into an EMPTY list', { lk, lkx });
}

// ── §6 WIRING (its read r2, N14): the boot's re-adoption waits for the read at its one caller; both installers word exit 16 as a wait ──
console.log('§6 wiring: the re-adoption waits at its caller; the installers say the wait');
{
  const SV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const SH = fs.readFileSync(path.join(ROOT, 'scripts/vibespace-agentd-install.sh'), 'utf8'), PS = fs.readFileSync(path.join(ROOT, 'scripts/vibespace-agentd-install.ps1'), 'utf8');
  ok(SV.includes("if (hosts.held && hosts.held() && hosts.whenRead) hosts.whenRead(go, 'the re-adoption of remote sessions left running'); else go();"),
    'server.js: the boot\'s re-adoption of remote sessions waits for the read while hosts.json is held (its get threw: the pass ended, a later resume killed the agent it would adopt)');
  const i16 = SH.indexOf('if [ "$CHECK_RC" -eq 16 ]; then'), ine = SH.indexOf('if [ "$CHECK_RC" -ne 0 ]; then'), p16 = PS.indexOf('if ($checkRc -eq 16) {'), pne = PS.indexOf('if ($checkRc -ne 0) {');
  ok(i16 > 0 && ine > i16 && /run this same command again in a few minutes/.test(SH.slice(i16, ine)) && p16 > 0 && pne > p16 && /run this same command again in a few minutes/.test(PS.slice(p16, pne)),
    'both installers word the check\'s exit 16 (the hub holds its machines) as a wait BEFORE the generic «the device cannot dial» line', { i16, ine, p16, pne });
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'hosts-held-census ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
