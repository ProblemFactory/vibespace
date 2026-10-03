/**
 * RemoteFs — file operations on a registered ssh host (collaboration, Files
 * cross-host). Every method runs one ssh command; no daemon on the remote,
 * reusing the HostManager's key/connection settings. Mirrors the local
 * /api/file* route shapes so files.js can dispatch on ?host= with the same
 * client code.
 *
 * Safety: all remote paths are single-quoted for the remote shell (shq). A
 * path with a literal newline would break the line-based parsers — the local
 * fs never produces those in practice and we reject them defensively.
 */

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { contentDisposition, fileNameOf } = require('./file-disposition');
const { agentVersionOf, reinstallStep } = require('./exit-reach');

// lane windows-device-fs — THE HUB ASSUMED `sh` FOR FILES TOO (B-c484, the owner's WIN-DESK1: GET /api/files?host=… →
// 400 "command failed (127)"). Every device operation below was an `sh -c` line over the device link (the home, the
// listing's fallback, du, zip, the download streams); a Windows machine has no `sh`. A WINDOWS agent's files now go
// through the agent's OWN fs ops (`fs-portable`: list / stat / read / write / mkdir / move / copy / rm / du / home, `~`
// expanded by the device, paths left as the device spells them); what still needs a shell there is refused BY NAME; a
// Windows agent too old for the ops is told its version and the one step. Every other machine: the paths below, unchanged.
const FS_PORTABLE_CAP = 'fs-portable';
const WIN_REFUSED = Object.freeze({
  zip: 'folder download as .zip is not available on Windows machines yet',
  'archive-list': 'opening an archive (.zip / .tar) is not available on Windows machines yet',
  'archive-entry': 'opening a file inside an archive is not available on Windows machines yet',
  'archive-extract': 'extracting an archive is not available on Windows machines yet',
  'make-archive': 'making an archive (.zip / .tar) is not available on Windows machines yet',
});
const WIN_CHUNK = 4 * 1024 * 1024; // one read-range per chunk (the agent's own worker reads 4 MB at a time)
/** The words for a Windows agent that predates `fs-portable` — the sentence lane device-upgrade-stuck says for commands. */
function filesOutdatedText(machine, agentVersion) {
  return `this machine's agent is ${agentVersionOf(agentVersion) || 'an older version'}, too old to browse files on Windows — ${reinstallStep(machine)}`;
}
function daemonInfoOf(dm) { try { const st = typeof dm.status === 'function' ? dm.status() : null; return (st && st.info) || {}; } catch { return {}; } }
const named = (code, message, status, params) => Object.assign(new Error(message), { code, status, params });
// verify-r2: the Files view's refusals travel as a CODE (+ its params) beside the English `error` — the client words them
// in the reader's language (src/lib/file-explorer-ops.js fsErrorText); every other error: `{ error }` as before
const FS_REFUSALS = Object.freeze(['device_agent_outdated', 'windows_unsupported', 'windows_no_shell']);
const fsErrorBody = (e) => ({ error: String((e && e.message) || e), ...(e && FS_REFUSALS.includes(e.code) ? { code: e.code, params: e.params || {} } : {}) });

// ONE archive-listing parser for local AND remote (B-b87b: RemoteFs used to
// return bare-string entries while /api/archive/list returned
// {name,size,isDirectory} objects — the viewer read e.name and crashed on
// every remote archive). files.js requires this too so the shapes can't
// drift again.
const ARCHIVE_LIST_MAX = 20000;
function parseArchiveListing(kind, out) {
  const entries = [];
  for (const line of String(out || '').split('\n')) {
    let name, size, isDirectory;
    if (kind === 'zip') {
      // "     1234  2026-07-03 12:00   dir/file.txt" (unzip -l -qq; totals row won't match)
      const m = line.match(/^\s*(\d+)\s+[\d-]+\s+[\d:]+\s+(.+)$/);
      if (!m) continue;
      name = m[2]; size = parseInt(m[1]); isDirectory = name.endsWith('/');
    } else {
      // "drwxr-xr-x user/grp 0 2026-07-03 12:00 dir/" (GNU tar -tvf)
      const m = line.match(/^([\-dlrwxsStT]{10})\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/);
      if (!m) continue;
      name = m[3];
      const arrow = name.indexOf(' -> '); // symlink target
      if (arrow > 0) name = name.substring(0, arrow);
      size = parseInt(m[2]); isDirectory = m[1][0] === 'd';
    }
    entries.push({ name, size, isDirectory });
    if (entries.length > ARCHIVE_LIST_MAX) break;
  }
  return { type: kind, entries: entries.slice(0, ARCHIVE_LIST_MAX), total: entries.length, truncated: entries.length > ARCHIVE_LIST_MAX };
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
// shq for PATHS: a quoted `~` never expands ('~/Downloads/x' landed in a
// literal ./~ directory on the remote — audit 2.192.0), so emit the tilde
// prefix as an unquoted "$HOME" and quote only the rest. The dial fast path
// (_devAbs) already expands ~ — this covers the ssh-legacy branches.
const shqp = (s) => {
  const str = String(s);
  if (str === '~') return '"$HOME"';
  if (str.startsWith('~/')) return `"$HOME"/${shq(str.slice(2))}`;
  return shq(str);
};

class RemoteFs {
  constructor(hostManager) { this.hosts = hostManager; }

  // ── CS data-plane (2.146.0): device-agent fast path. Returns null when the
  // flag is off / device unreachable — callers fall back to their ssh body.
  // Shapes returned here MIRROR the legacy methods exactly. ──
  async _dev(id) {
    // dial hosts have NO ssh fallback — always take the device path for them
    let dial = false;
    try { dial = this.hosts.get(id)?.transport === 'dial'; } catch { }
    if (!dial && !this.hosts.dataPlaneOn?.()) return null;
    try { return await this.hosts.deviceBounded(id, 5000); } catch { return null; }
  }
  async _devHome(id, dm) {
    if (!this._homes) this._homes = new Map();
    if (this._homes.has(id)) return this._homes.get(id);
    const home = (await dm.runCmd('sh', ['-c', 'echo "$HOME"'])).stdout.trim();
    if (home) this._homes.set(id, home);
    return home;
  }
  async _devAbs(id, dm, p) {
    const raw = String(p || '~');
    const info = daemonInfoOf(dm); // lane windows-device-fs: a Windows agent with the fs ops expands `~` itself (verify-r1 F1: an older one is asked `sh`, as before)
    if (info.platform === 'win32' && Array.isArray(info.capabilities) && info.capabilities.includes(FS_PORTABLE_CAP)) return raw;
    if (raw === '~') return this._devHome(id, dm);
    if (raw.startsWith('~/')) return (await this._devHome(id, dm)) + raw.slice(1);
    return raw;
  }

  _host(id) { return this.hosts.get(id); }

  /** lane windows-device-fs: → null for every machine that is not a Windows agent (the paths below, unchanged), else
   *  the DeviceManager of a Windows agent that has `fs-portable`. A Windows agent WITHOUT it is refused by name (its
   *  version + the one step); `op` names what cannot be done without a shell on Windows yet (WIN_REFUSED). */
  async _win(id, op = null) {
    const dm = await this._dev(id);
    if (!dm) return null;
    const info = daemonInfoOf(dm);
    if (info.platform !== 'win32') return null;
    // verify-r1 F1: refused only where the machine HAS NO `sh` — with one (Git for Windows / MSYS2 / Cygwin) the shell
    // lines below ran before this lane, and still do: a shell-only verb, or every verb for an agent without the fs ops
    const portable = Array.isArray(info.capabilities) && info.capabilities.includes(FS_PORTABLE_CAP);
    if (op || !portable) {
      if (await this._winHasSh(dm, info)) return null;
      if (op) throw named('windows_unsupported', WIN_REFUSED[op], 501, { op });
      throw named('device_agent_outdated', filesOutdatedText(this._host(id)?.name || id, info.daemonVersion), 409, { machine: this._host(id)?.name || id, version: agentVersionOf(info.daemonVersion) || '' });
    }
    return dm;
  }
  /** verify-r1 F1: does this Windows machine have `sh`? Its hello says (`posixShells`); an agent too old to say is ASKED, once
   *  per link (`sh -c 'exit 0'` — the line it was asked anyway); verify-r2: only an `sh` that RAN it (exit 0, in time) counts —
   *  a broken or hung one gets the outdated sentence (the agent's update is the way out), never its shell lines' errors. */
  _winHasSh(dm, info) {
    if (Array.isArray(info.posixShells)) return info.posixShells.includes('sh');
    if (!this._shSeen) this._shSeen = new WeakMap();
    if (!this._shSeen.has(info)) this._shSeen.set(info, dm.runCmd('sh', ['-c', 'exit 0'], { timeoutMs: 5000 }).then((r) => !!r && r.code === 0 && !r.timedOut, (e) => !(e && e.code === 'windows_no_shell')));
    return this._shSeen.get(info);
  }
  /** A Windows agent's file → an HTTP response over read-range (no `cat` there). Same contract as _devStreamTo. */
  async _winStreamTo(dm, filePath, res, { beforeBody = null } = {}) {
    const name = () => { if (beforeBody && !res.headersSent) { try { beforeBody(); } catch { } } };
    let gone = false; res.on('close', () => { gone = true; });
    let st;
    try { st = (await dm.fsStat(filePath)).stat; } catch { st = null; }
    if (!st || st.isDir) { if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); res.status(404).end(); } return; }
    try {
      for (let pos = 0; pos < (st.size || 0) && !gone;) {
        const rr = await dm.fsReadRange(filePath, pos, Math.min(WIN_CHUNK, st.size - pos));
        if (!rr.data.length) break;
        name();
        if (!res.write(rr.data)) await new Promise((r) => { res.once('drain', r); res.once('close', r); });
        pos += rr.data.length;
      }
      name(); res.end();
    } catch { try { res.end(); } catch { } }
  }
  /** A Windows agent's file → a LOCAL file, bounded (fetchToLocal's twin over read-range). */
  async _winFetchToLocal(dm, filePath, outPath, cap) {
    const st = (await dm.fsStat(filePath)).stat;
    if (st.isDir) throw new Error('file read failed (a folder)');
    if (st.size > cap) throw Object.assign(new Error(`file too large (>${Math.round(cap / 1048576)}MB)`), { status: 413 });
    const fd = fs.openSync(outPath, 'w');
    let written = 0;
    try {
      while (written < st.size) {
        const rr = await dm.fsReadRange(filePath, written, Math.min(WIN_CHUNK, st.size - written));
        if (!rr.data.length) break;
        fs.writeSync(fd, rr.data); written += rr.data.length;
      }
    } finally { fs.closeSync(fd); }
    return { size: written };
  }

  // Run a remote command, resolve stdout (Buffer). Rejects on non-zero exit.
  // DIAL hosts have no ssh — route the SAME shell command over the device link
  // (B-0d70: stat/rename/copy/move/archive were all ssh-only and 400'd for
  // dial machines). runCmd caps stdout at 1MB / timeout ≤30s — plenty for the
  // metadata-class commands _run carries; streamed downloads use _spawn, which
  // stays ssh-only (dial downloads ride the device fs read-range elsewhere).
  async _run(id, cmd, { timeoutMs = 15000, maxBuffer = 16 * 1024 * 1024 } = {}) {
    const h = this._host(id);
    if (h?.transport === 'dial') {
      const dm = await this._dev(id);
      if (!dm) throw new Error(`device "${h.name}" is offline`);
      const r = await dm.runCmd('sh', ['-c', cmd], { timeoutMs: Math.min(timeoutMs, 30000) });
      if (r.code !== 0) throw new Error((r.stderr || `command failed (${r.code})`).trim().slice(0, 400));
      return Buffer.from(r.stdout || '', 'utf-8');
    }
    return new Promise((resolve, reject) => {
      execFile('ssh', [...this.hosts.sshArgs(h, { multiplex: true }), '--', cmd], { timeout: timeoutMs, maxBuffer, encoding: 'buffer' },
        (err, stdout, stderr) => {
          if (err) return reject(new Error((stderr?.toString() || err.message || '').trim().slice(0, 400)));
          resolve(stdout);
        });
    });
  }

  /** ONE remote command → its stdout (Buffer): a caller's own bounded script (the Design window's read lists and
   *  base64-cats a folder in a single round trip — src/server/design-engine.js remoteReadScript). Same transport as
   *  every metadata op here: ssh, or the device link for a dial host (whose answer is bounded by the link). */
  async runScript(id, script, { timeoutMs = 30000, maxBuffer = 40 * 1024 * 1024 } = {}) { return this._run(id, String(script), { timeoutMs, maxBuffer }); }

  // Spawn a remote command and pipe its stdout to a stream (downloads).
  _spawn(id, cmd) {
    const h = this._host(id);
    return spawn('ssh', [...this.hosts.sshArgs(h, { multiplex: true }), '--', cmd]);
  }

  async home(id) {
    // dial devices have no ssh — the device link is the only path (B-0d70:
    // /api/home?host=<dial> used to 400 'has no ssh', so New Session could
    // never learn the device home and defaulted cwd to the LOCAL home).
    const w = await this._win(id); if (w) return String((await w.fsHome()).home || '');
    const dm = await this._dev(id);
    if (dm) { try { const h = await this._devHome(id, dm); if (h) return h; } catch { /* legacy */ } }
    const out = await this._run(id, 'printf %s "$HOME"');
    return out.toString().trim() || '/';
  }

  // ── Listing / metadata ──
  // One `find -maxdepth 1 -printf` gives name + type + size + mtime in a
  // single round trip (line = "T\tSIZE\tMTIME\tNAME"). Robust vs `ls` parsing.
  async list(id, dir) {
    if (/\n/.test(dir)) throw new Error('invalid path');
    const w = await this._win(id);
    if (w) { // the device lists and resolves `~` itself; its errors are the answer (no shell to fall back to)
      const r = await w.fsList(dir || '~');
      const items = r.entries.map((e) => ({ name: e.name, isDirectory: !!e.isDir, isSymlink: false, size: e.size || 0, modified: e.mtimeMs || 0, created: 0 }));
      items.sort((a, b) => (a.isDirectory !== b.isDirectory) ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name));
      return { path: r.path || dir, items };
    }
    const dm = await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, dir);
        const r = await dm.fsList(abs);
        return {
          path: abs,
          items: r.entries.map((e) => ({ name: e.name, isDirectory: !!e.isDir, isSymlink: false, size: e.size || 0, modified: e.mtimeMs || 0, created: 0 })),
        };
      } catch { /* legacy ssh below */ }
    }
    const d = dir && dir !== '~' ? dir : await this.home(id);
    // find -printf is GNU-only — on a macOS/BSD ssh host it errored into
    // 2>/dev/null and every folder rendered EMPTY (audit 2.192.0). Probe once
    // per listing; BSD path maps stat -f %HT to the %y type char.
    const cmd = `cd ${shqp(d)} 2>/dev/null && pwd && { if find . -maxdepth 0 -printf '' 2>/dev/null; then `
      + `find . -maxdepth 1 -mindepth 1 -printf '%y\\t%s\\t%T@\\t%f\\n' 2>/dev/null; else `
      + `find . -mindepth 1 -maxdepth 1 2>/dev/null | while IFS= read -r f; do `
      + `st=$(stat -f '%HT|%z|%m' "$f" 2>/dev/null) || continue; `
      + `ft=\${st%%|*}; rest=\${st#*|}; fs=\${rest%%|*}; fm=\${rest#*|}; `
      + `case "$ft" in Directory) y=d;; Symbolic*) y=l;; *) y=f;; esac; `
      + `[ -n "$fs" ] && printf '%s\\t%s\\t%s\\t%s\\n' "$y" "$fs" "$fm" "$(basename "$f")"; done; fi; } | LC_ALL=C sort`;
    const out = (await this._run(id, cmd)).toString();
    const lines = out.split('\n');
    const realPath = lines.shift() || d;
    const items = [];
    for (const line of lines) {
      if (!line) continue;
      const [type, size, mtime, ...nameParts] = line.split('\t');
      const name = nameParts.join('\t');
      if (!name) continue;
      // 'd' dir, 'l' symlink (resolve below is skipped for speed — treat as file unless dir test)
      let isDirectory = type === 'd';
      items.push({ name, isDirectory, isSymlink: type === 'l', size: parseInt(size) || 0, modified: (parseFloat(mtime) || 0) * 1000, created: 0 });
    }
    // resolve symlinked dirs in one extra call (only if any symlinks)
    const links = items.filter(i => i.isSymlink).map(i => i.name);
    if (links.length) {
      const test = links.map(n => `[ -d ${shq(path.posix.join(realPath, n))} ] && echo ${shq(n)}`).join('; ');
      const dirLinks = new Set((await this._run(id, test).catch(() => Buffer.from(''))).toString().split('\n').filter(Boolean));
      for (const i of items) if (i.isSymlink && dirLinks.has(i.name)) i.isDirectory = true;
    }
    items.sort((a, b) => (a.isDirectory !== b.isDirectory) ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name));
    return { path: realPath, items };
  }

  async info(id, filePath) {
    // dial device fast path (B-0d70): /api/file/info?host=<dial> was ssh-only
    // → always 400 'has no ssh' → the New Session preflight (_ensureCwdExists)
    // reported EVERY existing device dir as nonexistent (the '/Users/<user>
    // 不存在' report). fsStat gives size/mtime/isDir; a small read-range sniffs
    // binary (NUL byte in the head).
    const w = await this._win(id); // lane windows-device-fs: a Windows agent's errors are the answer (no shell rung)
    const dm = w || await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, filePath);
        const st = await dm.fsStat(abs);
        const isDirectory = !!st.stat.isDir;
        let isBinary = false;
        if (!isDirectory && st.stat.size > 0) {
          try { const rr = await dm.fsReadRange(abs, 0, Math.min(8192, st.stat.size)); isBinary = rr.data.includes(0); } catch { }
        }
        return { path: filePath, size: st.stat.size || 0, modified: st.stat.mtimeMs || 0, isBinary, isDirectory };
      } catch (e) {
        // a REAL 'not found' from the device must surface as an error (so the
        // preflight offers to mkdir) — don't fall through to the ssh body that
        // would throw the misleading 'has no ssh' for a dial host.
        if (w || this._host(id)?.transport === 'dial') throw e;
        /* ssh host: fall through to legacy */
      }
    }
    // size + mtime + type, and a binary sniff via `tr -d '\\0'` (portable
    // across sh/dash/bash — NUL count drops ⇒ binary; $'\\x00' needs bash)
    const cmd = `f=${shqp(filePath)}; if [ -d "$f" ]; then echo "dir"; stat -c '%s %Y' "$f" 2>/dev/null || stat -f '%z %m' "$f"; else echo "file"; stat -c '%s %Y' "$f" 2>/dev/null || stat -f '%z %m' "$f"; n=$(head -c 8192 "$f" | wc -c); z=$(head -c 8192 "$f" | tr -d '\\000' | wc -c); [ "$n" = "$z" ] && echo TXT || echo BIN; fi`;
    const out = (await this._run(id, cmd)).toString().trim().split('\n');
    const isDirectory = out[0] === 'dir';
    const [size, mtime] = (out[1] || '0 0').split(' ');
    const isBinary = out[2] === 'BIN';
    return { path: filePath, size: parseInt(size) || 0, modified: (parseInt(mtime) || 0) * 1000, isBinary, isDirectory };
  }

  async readText(id, filePath, maxBytes = 10 * 1024 * 1024) {
    const w = await this._win(id);
    const dm = w || await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, filePath);
        const st = await dm.fsStat(abs);
        if (st.stat.size > maxBytes) { const e = new Error('File too large (>10MB). Use hex viewer.'); e.size = st.stat.size; throw e; }
        const rr = await dm.fsReadRange(abs, 0, st.stat.size);
        return { path: filePath, content: rr.data.toString('utf-8'), size: st.stat.size };
      } catch (e) { if (e.size || w) throw e; /* too-large is REAL (a Windows agent's every error); others → legacy */ }
    }
    const info = await this.info(id, filePath);
    if (info.size > maxBytes) { const e = new Error('File too large (>10MB). Use hex viewer.'); e.size = info.size; throw e; }
    const buf = await this._run(id, `cat ${shq(filePath)}`, { maxBuffer: maxBytes + 1024 });
    return { path: filePath, content: buf.toString('utf-8'), size: info.size };
  }

  async readBinary(id, filePath, offset = 0, length = 65536) {
    const w = await this._win(id); if (w) return (await w.fsReadRange(filePath, Math.max(0, offset), Math.min(length, 1048576))).data;
    const dm = await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, filePath);
        const rr = await dm.fsReadRange(abs, Math.max(0, offset), Math.min(length, 1048576));
        return rr.data;
      } catch { /* legacy */ }
    }
    const len = Math.min(length, 1048576);
    const cmd = `dd if=${shq(filePath)} bs=1 skip=${offset | 0} count=${len | 0} 2>/dev/null`;
    return this._run(id, cmd, { maxBuffer: len + 4096 });
  }

  async write(id, filePath, contentBuffer) {
    const w = await this._win(id); if (w) { await w.fsWrite(filePath, contentBuffer); return { success: true }; }
    const dm = await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, filePath);
        await dm.fsWrite(abs, contentBuffer);
        return;
      } catch { /* legacy */ }
    }
    const h = this._host(id);
    await new Promise((resolve, reject) => {
      const child = spawn('ssh', [...this.hosts.sshArgs(h, { multiplex: true }), '--', `mkdir -p "$(dirname ${shqp(filePath)})" && cat > ${shqp(filePath)}`]);
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(err.trim() || `write failed (${code})`)));
      child.stdin.end(contentBuffer);
    });
    return { success: true };
  }

  async mkdir(id, dirPath) {
    const w = await this._win(id); if (w) { await w.fsMkdir(dirPath); return { success: true }; }
    const dm = await this._dev(id);
    if (dm) { try { await dm.fsMkdir(await this._devAbs(id, dm, dirPath)); return { success: true }; } catch { } }
    await this._run(id, `mkdir -p ${shqp(dirPath)}`); return { success: true };
  }

  async rename(id, from, to) { const w = await this._win(id); if (w) { await w.fsMove(from, to); return { success: true }; } await this._run(id, `mv -n ${shqp(from)} ${shqp(to)}`); return { success: true }; }

  async remove(id, target) {
    const w = await this._win(id); if (w) { await w.fsRm(target, true); return { success: true }; }
    const dm = await this._dev(id);
    if (dm) { try { await dm.fsRm(await this._devAbs(id, dm, target), true); return { success: true }; } catch { } }
    await this._run(id, `rm -rf ${shq(target)}`); return { success: true };
  }

  async stat(id, target, withDu = false) {
    // dial device fast path (B-0d70 review): `stat -c` / `du -sb` are GNU-only
    // and error on a macOS/BSD device. fsStat gives the portable core; mode is
    // the raw st_mode (rendered client-side), uid/gid/kind aren't in the
    // fs-op — acceptable for Properties on a device.
    const w = await this._win(id);
    if (w) { // lane windows-device-fs: du = the agent's own walk (`du -sk` was an sh line)
      const st = (await w.fsStat(target)).stat;
      let du, duPartial;
      if (withDu && st.isDir) { try { const r = await w.fsDu(target); du = r.bytes; duPartial = r.truncated ? r.entries : undefined; } catch { du = null; } } // verify-r2: a walk that stopped SAYS so (the size is "at least")
      return { path: target, size: st.size || 0, modified: st.mtimeMs || 0, mode: st.mode, uid: undefined, gid: undefined, kind: st.isDir ? 'directory' : 'regular file', du: withDu ? (du ?? null) : undefined, duPartial };
    }
    const dm = await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, target);
        const st = await dm.fsStat(abs);
        let du;
        if (withDu && st.stat.isDir) {
          // portable recursive size: `du -sk` (POSIX) → KiB; -b is GNU-only
          try { const r = await dm.runCmd('sh', ['-c', `du -sk ${shq(abs)} 2>/dev/null | cut -f1`], { timeoutMs: 30000 }); du = (parseInt(String(r.stdout).trim()) || 0) * 1024 || null; } catch { du = null; }
        }
        return { path: target, size: st.stat.size || 0, modified: st.stat.mtimeMs || 0, mode: st.stat.mode, uid: undefined, gid: undefined, kind: st.stat.isDir ? 'directory' : 'regular file', du: withDu ? (du ?? null) : undefined };
      } catch (e) { if (this._host(id)?.transport === 'dial') throw e; /* ssh: legacy below */ }
    }
    // GNU stat/du first, BSD (macOS ssh host) fallback; du -sk×1024 is the
    // POSIX-portable recursive size (the dial fast path above does the same)
    const cmd = `f=${shqp(target)}; stat -c '%s|%Y|%A|%U|%G|%F' "$f" 2>/dev/null || stat -f '%z|%m|%Sp|%Su|%Sg|%HT' "$f"; ${withDu ? '{ [ -d "$f" ] && { du -sb "$f" 2>/dev/null | cut -f1 || du -sk "$f" 2>/dev/null | cut -f1 | awk \'{print $1*1024}\'; } || echo; }' : 'echo'}`;
    const out = (await this._run(id, cmd, { timeoutMs: 30000 })).toString().trim().split('\n');
    const [size, mtime, mode, uid, gid, kind] = (out[0] || '').split('|');
    return { path: target, size: parseInt(size) || 0, modified: (parseInt(mtime) || 0) * 1000, mode, uid, gid, kind, du: withDu ? (parseInt(out[1]) || null) : undefined };
  }

  // copy/move WITHIN the same host (cross-host relay handled in files.js)
  async copy(id, from, to) { const w = await this._win(id); if (w) { await w.fsCopy(from, to); return { success: true }; } await this._run(id, `cp -rn ${shqp(from)} ${shqp(to)}`, { timeoutMs: 120000 }); return { success: true }; }
  async move(id, from, to) { const w = await this._win(id); if (w) { await w.fsMove(from, to); return { success: true }; } await this._run(id, `mv -n ${shqp(from)} ${shqp(to)}`, { timeoutMs: 120000 }); return { success: true }; }

  // Stream a remote file to an HTTP response (download / raw viewer). ALWAYS
  // NAMED (lane raw-filename): `attachment` for /api/download (that header is
  // unchanged), otherwise `inline` + the file's own name in both RFC 6266 forms —
  // /api/file/raw feeds every preview element, and a nameless response is saved
  // by the browser as "raw". The inline name is set just before the FIRST BYTE
  // goes out (or at a successful empty end); a file that cannot be read answers
  // 404 with no name on BOTH transports (r2: over ssh it was an empty 200 — the
  // pipe ended the response before cat's exit code arrived — and a Download
  // saved an empty file under the name).
  downloadTo(id, filePath, res, { attachment = false } = {}) {
    // the attachment name in BOTH forms, printable ASCII by construction: the raw name used to go into
    // `filename="…"` and any character above U+00FF (every CJK name) made setHeader THROW inside the async
    // route — swallowed, so a remote Download of `截图.png` was never answered (lane raw-filename r2)
    const attachName = attachment ? contentDisposition(fileNameOf(filePath), 'attachment') : null;
    if (attachName) res.setHeader('Content-Disposition', attachName);
    const inlineName = attachment ? null : contentDisposition(fileNameOf(filePath), 'inline');
    const nameIt = () => { if (inlineName && !res.headersSent) res.setHeader('Content-Disposition', inlineName); };
    // dial devices have no ssh — _spawn threw SYNC inside the async route and
    // the request was never answered (viewer/download hung forever, review
    // finding). Stream over the device link instead.
    if (this._host(id)?.transport === 'dial') {
      this._win(id).then((w) => (w ? this._winStreamTo(w, filePath, res, { beforeBody: nameIt }) // lane windows-device-fs: no `cat` there
        : this._devStreamTo(id, 'cat', [filePath], res, { notFoundOnFail: true, beforeBody: nameIt })),
      (e) => { if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); res.status(e.status || 502).json({ error: e.message }); } });
      return;
    }
    this._streamChild(this._spawn(id, `cat ${shq(filePath)}`), res, { beforeBody: nameIt });
  }

  // Stream a folder as a zip (download-zip)
  downloadZipTo(id, dirPath, res) {
    const parent = path.posix.dirname(dirPath), base = path.posix.basename(dirPath);
    res.setHeader('Content-Type', 'application/zip');
    const zipName = contentDisposition((base || 'archive') + '.zip', 'attachment'); // both forms, ASCII (a CJK folder name threw here)
    if (zipName) res.setHeader('Content-Disposition', zipName);
    if (this._host(id)?.transport === 'dial') {
      this._win(id, 'zip').then(() => this._devStreamTo(id, 'sh', ['-c', `cd ${shq(parent)} && zip -r - ${shq(base)}`], res, { notFoundOnFail: true }),
        (e) => { if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); res.status(e.status || 502).json({ error: e.message }); } }); // a Windows machine: refused by name
      return;
    }
    this._streamChild(this._spawn(id, `cd ${shq(parent)} && zip -r - ${shq(base)}`), res);
  }

  // A spawned command's stdout → an HTTP response (the ssh downloads). The
  // response ENDS ON THE CHILD'S EXIT, not on stdout's end (lane raw-filename
  // r2): with pipe's default end, a missing file was already an empty 200 by
  // the time cat's exit code arrived — the `404` below it was dead code. Now a
  // command that fails before its first byte answers 404 with no name and no
  // type (the caller's attachment headers are withdrawn), a spawn that fails
  // (no ssh binary) answers 502 — an unhandled child 'error' used to end the
  // whole server — and a viewer that goes away ends the child (an unpiped
  // stdout blocks the remote `cat` forever: every aborted <video> seek on a
  // remote file left one behind). `beforeBody` names the response just before
  // the first byte, or at a successful empty end.
  _streamChild(child, res, { beforeBody = null } = {}) {
    let wrote = false, done = false;
    const name = () => { if (beforeBody && !res.headersSent) { try { beforeBody(); } catch { } } };
    child.stdout.once('data', () => { wrote = true; name(); }); // registered BEFORE the pipe: runs ahead of its first write
    child.stdout.pipe(res, { end: false });
    child.stderr.on('data', () => {});
    child.on('error', (e) => {
      if (done) return; done = true;
      if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); res.status(502).json({ error: String((e && e.message) || e) }); }
      else { try { res.end(); } catch { } }
    });
    child.on('close', (code) => {
      if (done) return; done = true;
      if (code !== 0 && !wrote && !res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); res.status(404).end(); return; }
      name(); res.end();
    });
    res.on('close', () => { if (!done) { try { child.kill('SIGTERM'); } catch { } } });
  }

  // Stream a device command's stdout into an HTTP response (dial downloads).
  // Same contract as _streamChild: `beforeBody` before the first byte (or at a
  // successful empty end); a failure before any byte withdraws the caller's
  // name + type (404 when notFoundOnFail, else 502) — never a named empty file.
  async _devStreamTo(id, cmd, args, res, { notFoundOnFail = false, beforeBody = null } = {}) {
    const name = () => { if (beforeBody && !res.headersSent) { try { beforeBody(); } catch { } } };
    const unname = () => { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); };
    try {
      const dm = await this._dev(id);
      if (!dm) throw new Error('device offline');
      let wrote = false;
      const r = await dm.runStream(cmd, args, { onData: (b) => { if (!wrote) name(); wrote = true; try { res.write(b); } catch {} } });
      if (r.code !== 0 && !wrote && notFoundOnFail && !res.headersSent) { unname(); return res.status(404).end(); }
      if (!wrote) name();
      res.end();
    } catch (e) {
      if (!res.headersSent) { unname(); res.status(502).json({ error: e.message }); }
      else try { res.end(); } catch {}
    }
  }

  // Archives
  async archiveList(id, archivePath) {
    await this._win(id, 'archive-list');
    const ap = shq(archivePath);
    const kind = /\.zip$/i.test(archivePath) ? 'zip' : 'tar';
    const cmd = kind === 'zip'
      ? `unzip -l -qq ${ap} 2>/dev/null | head -20050`
      : `tar -tvf ${ap} 2>/dev/null | head -20050`;
    const out = (await this._run(id, cmd, { timeoutMs: 30000, maxBuffer: 32 * 1024 * 1024 })).toString();
    const parsed = parseArchiveListing(kind, out);
    if (parsed.entries.length || kind === 'zip' || !out.trim()) return parsed;
    // BSD tar (macOS hosts) lists a different -tvf column layout the GNU
    // regex can't read — degrade to plain names rather than an empty viewer
    const names = (await this._run(id, `tar -tf ${ap} 2>/dev/null | head -20000`, { timeoutMs: 30000, maxBuffer: 32 * 1024 * 1024 })).toString();
    const entries = names.split('\n').filter(Boolean).map((n) => ({ name: n, size: 0, isDirectory: n.endsWith('/') }));
    return { type: kind, entries, total: entries.length, truncated: false };
  }
  // Stream a remote shell command's stdout into a LOCAL file, binary-safe on
  // both transports, size-capped. Core for archive entry extraction and the
  // local-parser previews (xlsx/docx/csv) that have no remote library.
  async _streamCmdToFile(id, cmd, outPath, cap, { timeoutMs = 120000, what = 'file' } = {}) {
    const h = this._host(id);
    const ws = fs.createWriteStream(outPath);
    let written = 0;
    if (h?.transport === 'dial') {
      const dm = await this._dev(id);
      if (!dm) { try { ws.destroy(); } catch { } throw new Error(`device "${h.name}" is offline`); }
      let over = false;
      const r = await dm.runStream('sh', ['-c', cmd], { onData: (b) => { written += b.length; if (written > cap) { over = true; return; } try { ws.write(b); } catch { } } });
      await new Promise((done) => ws.end(done));
      if (over) throw Object.assign(new Error(`${what} too large (>${Math.round(cap / 1048576)}MB)`), { status: 413 });
      if (r.code !== 0 && written === 0) throw new Error(`${what} read failed (exit ${r.code})`);
      return { size: written };
    }
    const child = this._spawn(id, `${cmd} | head -c ${cap + 1}`);
    child.stdout.on('data', (b) => { written += b.length; });
    child.stdout.pipe(ws);
    child.stderr.on('data', () => { });
    const timer = setTimeout(() => { try { child.kill(); } catch { } }, timeoutMs);
    const code = await new Promise((resolve) => child.on('close', resolve));
    clearTimeout(timer);
    await new Promise((done) => (ws.writableFinished ? done() : ws.on('finish', done)));
    if (written > cap) throw Object.assign(new Error(`${what} too large (>${Math.round(cap / 1048576)}MB)`), { status: 413 });
    if (code !== 0 && written === 0) throw new Error(`${what} read failed (exit ${code})`);
    return { size: written };
  }
  // Pull one remote file to a local path (bounded).
  async fetchToLocal(id, filePath, outPath, cap = 20 * 1024 * 1024) {
    const w = await this._win(id); if (w) return this._winFetchToLocal(w, filePath, outPath, cap);
    return this._streamCmdToFile(id, `cat ${shq(filePath)}`, outPath, cap, { what: 'file' });
  }
  // Extract ONE entry off the host into a LOCAL file (the archive viewer's
  // entry-click path — it opens the temp file through the normal viewer
  // pipeline, which is local by definition).
  async archiveExtractEntry(id, archivePath, entry, outPath) {
    await this._win(id, 'archive-entry');
    const ap = shq(archivePath);
    // unzip treats [ ] * ? as globs — escape for a literal member name
    const zipLit = shq(entry.replace(/([\[\]*?])/g, '\\$1'));
    const en = shq(entry);
    const cmd = `case ${ap} in *.zip) unzip -p ${ap} ${zipLit};; *) tar -xOf ${ap} ${en};; esac`;
    return this._streamCmdToFile(id, cmd, outPath, 200 * 1024 * 1024, { what: 'entry' });
  }
  async archiveExtract(id, archivePath, destDir) {
    await this._win(id, 'archive-extract');
    const ap = shq(archivePath), dd = shq(destDir);
    const cmd = `mkdir -p ${dd} && case ${ap} in *.zip) unzip -n ${ap} -d ${dd};; *.tar.gz|*.tgz) tar -xzkf ${ap} -C ${dd};; *.tar) tar -xkf ${ap} -C ${dd};; *) tar -xkf ${ap} -C ${dd};; esac`;
    await this._run(id, cmd, { timeoutMs: 300000 });
    return { success: true };
  }
  async makeArchive(id, destPath, parentDir, names) {
    await this._win(id, 'make-archive');
    const list = names.map(shq).join(' ');
    const dp = shq(destPath);
    const cmd = `cd ${shq(parentDir)} && case ${dp} in *.zip) zip -r ${dp} ${list};; *.tar.gz|*.tgz) tar -czf ${dp} ${list};; *.tar) tar -cf ${dp} ${list};; *.tar.xz) tar -cJf ${dp} ${list};; esac`;
    await this._run(id, cmd, { timeoutMs: 300000 });
    return { success: true };
  }

  // Directory autocomplete (delegated — HostManager already has it)
  dirComplete(id, input) { return this.hosts.dirComplete(id, input); }
}

module.exports = { RemoteFs, parseArchiveListing, FS_PORTABLE_CAP, WIN_REFUSED, filesOutdatedText, fsErrorBody };
