'use strict';
/**
 * THE TREADMILL, BUILT (lane cli-2-1-308-records — the cli-2-1-307-records report's proposal). The hub's claude
 * auto-updates (2.1.296 → 2.1.307 → 2.1.308 within ten days) faster than a release registers each build's records
 * (src/record-shape.js SCHEMA_CLI_VERSIONS — the builds whose record table this release carries). Until one is
 * registered, its conversations may show red cards for the records it added. This module:
 *   (a) SAYS IT ONCE per build — a claude version the oracle does not know, seen as the hub's CLI (oat-file-sync's
 *       --version tick: boot + 20 s, then every 15 min) or on a conversation's drift card (message-manager
 *       _noteDrift, through global.__vsCliSeen) — ONE journal line and ONE telemetry event (`cli-unknown-version`,
 *       which Diagnostics' «Harness drift» table lists), the build kept in data/cli-registration.json so a restart
 *       does not say it again; GET /api/cli-registration is what Diagnostics and Manage agents word
 *       (src/lib/cli-registration-words.js);
 *   (b) DRAFTS THE RECORD TABLE when a person asks (POST /api/cli-registration/draft — 「生成记录草稿」 on Manage
 *       agents' claude row): `scripts/claude-cli-dump.mjs --auto` in a child — the static dump of the INSTALLED
 *       binary (its strings; the binary is never run, the version is read off the file) into
 *       data/claude-cli-dumps/<v>.json with its diff against the newest pinned dump, so the next registration lane
 *       starts from a dump taken on the box that saw the build. It never registers anything: that stays a reviewed
 *       commit. The long-lived-token measurement stays 主开发's namespace rung; the account row already names it as
 *       the owed step (`cli-unmeasured`).
 * No vendor call, no session, no `claude update`.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { SCHEMA_CLI_VERSIONS } = require('../record-shape.js');
const { cliVersionOf } = require('../cli-caps.js');
const { serviceEnv } = require('../agent-env.js');
const SR = require('../store-read.js');   // B-f276 (lane hub-loop-stalls, r4719): cli-registration.json under the store-read law…
const HOLD = require('../store-read-hold.js');   // …and its hold: a failed read is HELD, never «no build seen yet»

const SOURCES = Object.freeze(['hub', 'conversation']);
const DRAFT_TIMEOUT_MS = 120e3;
const KEEP_BUILDS = 20;
const vcmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function create({ dataDir, rootDir, claudeCmd = null, pinned = SCHEMA_CLI_VERSIONS, log = (...a) => console.log(...a), event = (n, d) => global.__vsEvent?.(n, d), now = Date.now, timeoutMs = DRAFT_TIMEOUT_MS, writer: W = null } = {}) {
  if (!dataDir || !rootDir) throw new Error('cli-registration: dataDir and rootDir are required');
  const stateFile = path.join(dataDir, 'cli-registration.json');
  const dumpsDir = path.join(dataDir, 'claude-cli-dumps');
  const script = path.join(rootDir, 'scripts', 'claude-cli-dump.mjs');
  const known = (v) => pinned.includes(v);
  let seen = {};
  // a build this release registers is no longer owed: its row goes (the file then holds only what is still unknown)
  const prune = (o) => { for (const v of Object.keys(o)) if (!cliVersionOf(v) || known(v) || !o[v] || !Array.isArray(o[v].sources)) delete o[v]; return o; };
  // B-f276 (lane hub-loop-stalls, r4719) — THE STORE-READ LAW. The release read ANY failed read or torn bytes as «no build seen»: a
  // build already said was said AGAIN (its journal line and its `cli-unknown-version` event), its first-seen date reset, and the next
  // note wrote that over the file. Now through store-read's answer to the hold (code `cli_registration_unread`). HELD: note() keeps
  // what it sees IN MEMORY (`pending`) and says nothing new; save writes nothing; status() names the hold. LIFTED: the record loaded,
  // what the hold kept merged into it (the OLDER first-seen wins, the sources joined), ONLY a build the record never had is said, and
  // the record written once. TORN: kept aside once, then empty (the hold's own law)
  const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  let pending = {};
  const say = (v, source) => {
    log(`[cli-registration] claude ${v} is newer than this release's record table — a record kind it adds is listed in Diagnostics, conversations are not affected (seen ${source === 'hub' ? 'as the hub\'s CLI' : 'on a conversation\'s records'}; this release knows ${pinned[pinned.length - 1]} and older. Record draft: Manage agents ▸ claude ▸ 生成记录草稿, or node scripts/claude-cli-dump.mjs --auto)`);
    try { event('cli-unknown-version', `claude ${v} · ${source}`); } catch { }
  };
  const hold = HOLD.create({ file: stateFile, valid: isRecord, code: 'cli_registration_unread', aside: (m) => stateFile + '.corrupt-' + m,
    words: (h) => `the record of the claude builds already said could not be read (${h && h.code}) — VibeSpace reads it again by itself; nothing is written over it, and a build seen meanwhile is said once it reads`,
    log: (l) => log(`[cli-registration] ${l}`),
    onLift: (v) => {
      seen = prune(v && isRecord(v.seen) ? v.seen : {});
      const kept = pending; pending = {};
      const fresh = [];
      for (const [ver, rec] of Object.entries(kept)) {
        const had = seen[ver];
        if (had) seen[ver] = { ...had, firstSeen: Math.min(had.firstSeen || rec.firstSeen, rec.firstSeen || had.firstSeen), sources: [...new Set([...had.sources, ...rec.sources])] };
        else { seen[ver] = rec; fresh.push([ver, rec.sources[0]]); }
      }
      if (Object.keys(kept).length) save();
      for (const [ver, source] of fresh) say(ver, source);
    } });
  { let read; try { read = { text: fs.readFileSync(stateFile, 'utf8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: isRecord });   // the record of the builds said: THE ANCHOR (test-data-store-census)
    if (hold.start(a) === 'data') seen = prune(isRecord(a.value.seen) ? a.value.seen : {}); }
  const writer = () => W || require('../store-writer.js').storeWriter();   // W: a suite's stand-in
  const save = () => {
    if (!hold.writable('a write of the record of the claude builds said')) return;   // HELD: never over a file that could not be read
    const keep = Object.keys(seen).sort(vcmp).slice(-KEEP_BUILDS);
    seen = Object.fromEntries(keep.map((v) => [v, seen[v]]));
    // B-574d (lane lg-text-legs-3): THE STORE WRITER writes it — off the hub's loop, every byte or nothing, synced (src/store-writer.js);
    // the latest «seen» is written (a burst of sightings is one write), a failed write said as before
    const body = JSON.stringify({ v: 1, seen }, null, 1) + '\n';
    try { writer().dirty(stateFile, { name: 'cli-registration.write', makeDir: true, produce: () => body, onWritten: (ok, e) => { if (!ok) { log('[cli-registration] could not keep data/cli-registration.json:', (e && e.message) || e); } } }); } catch (e) { log('[cli-registration] could not keep data/cli-registration.json:', (e && e.message) || e); }
  };
  let hub = null, inFlight = null;

  /** a claude version seen (the hub's CLI, or a conversation's drift card) ⇒ {version, registered, said}; says it ONCE per build */
  function note(raw, source) {
    const v = cliVersionOf(raw);
    if (!v || !SOURCES.includes(source)) return null;
    if (source === 'hub') hub = v;
    if (known(v)) return { version: v, registered: true, said: false };
    if (hold.held()) {   // HELD: kept in memory, said nothing (the record may already hold it) — judged at the lift
      const p = pending[v];
      if (!(p && p.sources.includes(source))) pending[v] = p ? { ...p, sources: [...p.sources, source] } : { firstSeen: now(), sources: [source] };
      return { version: v, registered: false, said: false, held: true };
    }
    const rec = seen[v];
    if (rec && rec.sources.includes(source)) return { version: v, registered: false, said: false };
    seen[v] = rec ? { ...rec, sources: [...rec.sources, source] } : { firstSeen: now(), sources: [source] };
    save();
    if (!rec) say(v, source);
    return { version: v, registered: false, said: !rec };
  }
  function draftOf(v) {
    const file = path.join(dumpsDir, v + '.json');
    let d = null; try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    const dr = d && d.draft;
    return dr ? { file: 'data/claude-cli-dumps/' + v + '.json', takenAt: dr.takenAt || null, against: dr.against || null, changes: dr.diff && Number.isFinite(dr.diff.changes) ? dr.diff.changes : null } : null;
  }
  /** what Diagnostics and Manage agents word: the hub's CLI, the newest registered build, every unregistered build seen */
  function status() {
    return {
      newest: pinned[pinned.length - 1],
      hub: hub ? { version: hub, registered: known(hub) } : null,
      unregistered: Object.keys(seen).filter((v) => !known(v)).sort(vcmp).map((v) => ({ version: v, sources: seen[v].sources.slice(), firstSeen: seen[v].firstSeen || null, draft: draftOf(v) })),
      held: hold.held() ? { code: 'cli_registration_unread', words: hold.words() } : null,   // B-f276: the record unread — what it holds is not shown as nothing
    };
  }
  /** HUMAN-TRIGGERED ONLY: the static dump of the hub's installed claude (one at a time) ⇒ {ok, version, file, changes, wrote} | {ok:false, code, error} */
  function draft() {
    if (inFlight) return inFlight;
    if (!hub) return Promise.resolve({ ok: false, code: 'no-cli', error: 'the hub has not read its claude version yet' });
    if (known(hub)) return Promise.resolve({ ok: false, code: 'registered', error: `claude ${hub} is registered in this release` });
    const bin = typeof claudeCmd === 'function' ? claudeCmd() : claudeCmd;
    inFlight = new Promise((resolve) => {
      execFile(process.execPath, [script, '--auto', '--data', dataDir, ...(bin ? ['--bin', bin] : [])], { env: serviceEnv(process.env), timeout: timeoutMs, maxBuffer: 1 << 20, windowsHide: true }, (err, stdout) => {
        let r = null; try { r = JSON.parse(String(stdout || '').trim().split('\n').pop()); } catch { }
        if (!r || r.error || err) { const why = (r && r.error) || (err && (err.killed ? `killed (the ${Math.round(timeoutMs / 1000)} s limit)` : err.message)) || 'no answer'; log(`[cli-registration] record draft failed: ${String(why).slice(0, 300)}`); return resolve({ ok: false, code: 'failed', error: String(why).slice(0, 300) }); }
        const out = { ok: true, version: r.version, wrote: !!r.wrote, file: r.file ? 'data/claude-cli-dumps/' + path.basename(r.file) : null, changes: r.changes ?? null, against: pinned[pinned.length - 1], registered: !!r.registered };
        if (out.file) log(`[cli-registration] record draft for claude ${r.version}: ${out.file}${out.wrote ? '' : ' (already taken)'} — ${out.changes ?? '?'} changes against ${pinned[pinned.length - 1]}`);
        resolve(out);
      });
    }).finally(() => { inFlight = null; });
    return inFlight;
  }
  /** (suites, a restart's read) the state's last save ON DISK — the writer's own answer */
  const landed = () => Promise.resolve(writer().durable(stateFile));
  return { note, noteHub: (v) => note(v, 'hub'), status, draft, held: () => hold.held(), stop: () => hold.stop(), landed };
}

/** the routes + the drift hook; returns the registry (its noteHub is oat-file-sync's onCliVersion) */
function mount(app, opts) {
  const reg = create(opts);
  global.__vsCliSeen = (v) => { try { reg.note(v, 'conversation'); } catch { } };
  app.get('/api/cli-registration', (req, res) => res.json(reg.status()));
  // HUMAN-TRIGGERED ONLY. POST because it starts a process (a GET is pre-fetchable); one draft at a time.
  app.post('/api/cli-registration/draft', async (req, res) => { const r = await reg.draft(); res.status(r.ok ? 200 : r.code === 'failed' ? 500 : 409).json(r); });
  return reg;
}

module.exports = { create, mount, SOURCES, DRAFT_TIMEOUT_MS };
