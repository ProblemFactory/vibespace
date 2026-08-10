'use strict';
/**
 * THE context-folder sync — ONE implementation for every machine
 * (CS separation, 2.277.0; docs/design-cs-unification.md row "Ctx sync").
 *
 * WHAT IT DOES: keeps a Task Group's contextDir mirrored at
 * <remoteHome>/.vibespace/ctx/<groupId> on the machine a member session runs
 * on — bidirectional, newer-wins, never deletes, `.vibespace/` excluded —
 * so injected file paths actually exist there and remote-written artifacts
 * flow back (local signature change ⇒ every member re-injects next turn).
 * LOCAL sessions read the contextDir directly: no sync is genuinely
 * TRANSPORT-ONLY, not a divergence.
 *
 * WHY IT LIVES HERE: it used to exist twice with DIFFERENT semantics —
 * ssh = a bidirectional rsync pair with NO caps; dial = a per-file hashed
 * sync with a SILENT ≤400-files/≤2MB cap. A 3MB context file reached every
 * ssh host and silently never reached a dial device, and nobody could see
 * why. Now the hashed sync over the device link is the one implementation
 * for all transports; ssh keeps its rsync pair ONLY as the legacy fallback
 * when the device link is down (the writer-sweep pattern), and every capped
 * skip is REPORTED through onSkip — a bounded sync may refuse a file, it may
 * never lose one silently.
 *
 * Sync semantics (identical on every transport):
 *  - inventory probe = one dm.runCmd (portable: GNU-else-BSD stat,
 *    sha256sum-else-shasum) listing mtime+sha per remote file;
 *  - push where local differs and remote isn't strictly newer;
 *  - pull where remote differs and is strictly newer (traversal-guarded —
 *    the rel path is remote-supplied);
 *  - equal sha ⇒ skip both directions (fsWrite can't preserve mtimes, so
 *    content equality is what makes echo ping-pong impossible).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Bounds: a sync must stay bounded (this runs on a 60s timer over a mux that
// also carries live sessions) — but the old 2MB/400 silently ate real files.
const FILE_CAP = 16 * 1024 * 1024; // per file
const MAX_FILES = 1000;            // per group dir

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * @param {object} o
 * @param {object} o.hosts       HostManager (deviceBounded resolves any machine)
 * @param {string} o.hostId      machine id (falsy would be local = no-op by design; callers gate)
 * @param {object} o.group       Task Group ({id, contextDir})
 * @param {string} o.remoteDir   <remoteHome>/.vibespace/ctx/<groupId>
 * @param {function} [o.onSkip]  (rel, why:'size'|'count', size) — REQUIRED honesty channel
 * @param {number} [o.connectMs]
 */
async function syncGroupCtxOverDevice({ hosts, hostId, group, remoteDir, onSkip = () => { }, connectMs = 15000 }) {
  const dm = await hosts.deviceBounded(hostId, connectMs);
  if (!dm) throw new Error('device offline');
  const local = group.contextDir.replace(/\/+$/, '');
  const inv = await dm.runCmd('sh', ['-c',
    `mkdir -p ${shq(remoteDir)}; cd ${shq(remoteDir)} && find . -type f ! -path './.vibespace/*' 2>/dev/null | while IFS= read -r f; do ` +
    `printf '%s\\t%s\\t%s\\n' "$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)" ` +
    `"$( (sha256sum "$f" 2>/dev/null || shasum -a 256 "$f" 2>/dev/null) | cut -d' ' -f1)" "$f"; done`], { timeoutMs: 25000 });
  const remote = new Map(); // rel → {mt, sha}
  for (const line of String(inv?.stdout || '').split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const rel = parts.slice(2).join('\t').replace(/^\.\//, '');
    if (rel) remote.set(rel, { mt: parseInt(parts[0]) || 0, sha: parts[1] || '' });
  }
  const localFiles = [];
  let overCount = false;
  const walk = (dir, rel) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === '.vibespace') continue;
      const p = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) {
        if (localFiles.length >= MAX_FILES) { if (!overCount) { overCount = true; onSkip(r, 'count', 0); } continue; }
        try {
          const st = fs.statSync(p);
          if (st.size > FILE_CAP) { onSkip(r, 'size', st.size); continue; }
          localFiles.push({ p, r, mt: Math.floor(st.mtimeMs / 1000), size: st.size });
        } catch { }
      }
    }
  };
  walk(local, '');
  const shaOf = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } };
  const mkdirs = new Set();
  const localByRel = new Map(localFiles.map((f) => [f.r, f]));
  let pushed = 0, pulled = 0;
  for (const f of localFiles) {
    const rm = remote.get(f.r);
    f.sha = shaOf(f.p);
    if (!f.sha) continue;
    if (rm && rm.sha === f.sha) continue;      // identical — nothing to move either way
    if (rm && rm.mt > f.mt + 1) continue;      // remote strictly newer — the pull pass owns it
    const dir = path.posix.dirname(`${remoteDir}/${f.r}`);
    if (dir !== remoteDir && !mkdirs.has(dir)) { try { await dm.fsMkdir(dir); } catch { } mkdirs.add(dir); }
    try { await dm.fsWrite(`${remoteDir}/${f.r}`, fs.readFileSync(f.p)); pushed++; } catch { }
  }
  for (const [rel, rm] of remote) {
    const lf = localByRel.get(rel);
    if (lf && lf.sha && lf.sha === rm.sha) continue;
    if (lf && lf.mt >= rm.mt - 1) continue;    // local same-age-or-newer — push pass owned it
    const lp = path.resolve(local, rel);
    if (lp !== local && !lp.startsWith(local + path.sep)) continue; // traversal guard on remote-supplied rel
    try {
      const r = await dm.fsReadRange(`${remoteDir}/${rel}`, 0, FILE_CAP + 1);
      if (!r?.data) continue;
      if (r.data.length > FILE_CAP) { onSkip(rel, 'size', r.data.length); continue; }
      fs.mkdirSync(path.dirname(lp), { recursive: true });
      fs.writeFileSync(lp, r.data);
      pulled++;
    } catch { }
  }
  return { pushed, pulled, via: 'device' };
}

/** Legacy ssh fallback: the bidirectional rsync pair this feature shipped
 *  with (2.45.0). Used ONLY when the device link is down on an ssh host —
 *  dial has no second channel, local needs none. */
async function syncGroupCtxOverRsync({ hosts, host, group, remoteDir }) {
  await hosts._ssh(host, `mkdir -p "${remoteDir}"`);
  const e = hosts.sshCmd(host);
  const local = group.contextDir.replace(/\/+$/, '') + '/';
  const remote = `${hosts.dest(host)}:${remoteDir}/`;
  const opts = ['-az', '--update', '--exclude', '.vibespace', '--timeout', '25', '-e', e];
  const rsync = (args) => new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile('rsync', args, { timeout: 60000 }, (err, so, se) => err ? reject(new Error(String(se || err.message).slice(0, 200))) : resolve());
  });
  await rsync([...opts, local, remote]); // push newer local files
  await rsync([...opts, remote, local]); // pull newer remote artifacts back
  return { via: 'rsync' };
}

/** The one entry point. Tries the device link first on EVERY transport;
 *  ssh degrades to rsync, dial/others surface the device error. */
async function syncGroupCtx({ hosts, host, group, remoteDir, onSkip }) {
  try {
    return await syncGroupCtxOverDevice({ hosts, hostId: host.id, group, remoteDir, onSkip });
  } catch (e) {
    if (host.transport === 'dial') throw e;
    return await syncGroupCtxOverRsync({ hosts, host, group, remoteDir });
  }
}

module.exports = { syncGroupCtx, syncGroupCtxOverDevice, syncGroupCtxOverRsync, FILE_CAP, MAX_FILES };
