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

const SOURCES = Object.freeze(['hub', 'conversation']);
const DRAFT_TIMEOUT_MS = 120e3;
const KEEP_BUILDS = 20;
const vcmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function create({ dataDir, rootDir, claudeCmd = null, pinned = SCHEMA_CLI_VERSIONS, log = (...a) => console.log(...a), event = (n, d) => global.__vsEvent?.(n, d), now = Date.now, timeoutMs = DRAFT_TIMEOUT_MS } = {}) {
  if (!dataDir || !rootDir) throw new Error('cli-registration: dataDir and rootDir are required');
  const stateFile = path.join(dataDir, 'cli-registration.json');
  const dumpsDir = path.join(dataDir, 'claude-cli-dumps');
  const script = path.join(rootDir, 'scripts', 'claude-cli-dump.mjs');
  const known = (v) => pinned.includes(v);
  let seen = {};
  try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (j && j.seen && typeof j.seen === 'object') seen = j.seen; } catch { }
  // a build this release registers is no longer owed: its row goes (the file then holds only what is still unknown)
  for (const v of Object.keys(seen)) if (!cliVersionOf(v) || known(v) || !seen[v] || !Array.isArray(seen[v].sources)) delete seen[v];
  const save = () => {
    const keep = Object.keys(seen).sort(vcmp).slice(-KEEP_BUILDS);
    seen = Object.fromEntries(keep.map((v) => [v, seen[v]]));
    try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = stateFile + '.tmp-' + process.pid; fs.writeFileSync(tmp, JSON.stringify({ v: 1, seen }, null, 1) + '\n'); fs.renameSync(tmp, stateFile); } catch (e) { log('[cli-registration] could not keep data/cli-registration.json:', (e && e.message) || e); }
  };
  let hub = null, inFlight = null;

  /** a claude version seen (the hub's CLI, or a conversation's drift card) ⇒ {version, registered, said}; says it ONCE per build */
  function note(raw, source) {
    const v = cliVersionOf(raw);
    if (!v || !SOURCES.includes(source)) return null;
    if (source === 'hub') hub = v;
    if (known(v)) return { version: v, registered: true, said: false };
    const rec = seen[v];
    if (rec && rec.sources.includes(source)) return { version: v, registered: false, said: false };
    seen[v] = rec ? { ...rec, sources: [...rec.sources, source] } : { firstSeen: now(), sources: [source] };
    save();
    if (!rec) {
      log(`[cli-registration] claude ${v} is not registered — records may show as new fields until the next release (seen ${source === 'hub' ? 'as the hub\'s CLI' : 'on a conversation\'s records'}; this release knows ${pinned[pinned.length - 1]} and older. Record draft: Manage agents ▸ claude ▸ 生成记录草稿, or node scripts/claude-cli-dump.mjs --auto)`);
      try { event('cli-unknown-version', `claude ${v} · ${source}`); } catch { }
    }
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
  return { note, noteHub: (v) => note(v, 'hub'), status, draft };
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
