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

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

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
    try { return await this.hosts.device(id); } catch { return null; }
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
    if (raw === '~') return this._devHome(id, dm);
    if (raw.startsWith('~/')) return (await this._devHome(id, dm)) + raw.slice(1);
    return raw;
  }

  _host(id) { return this.hosts.get(id); }

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

  // Spawn a remote command and pipe its stdout to a stream (downloads).
  _spawn(id, cmd) {
    const h = this._host(id);
    return spawn('ssh', [...this.hosts.sshArgs(h, { multiplex: true }), '--', cmd]);
  }

  async home(id) {
    // dial devices have no ssh — the device link is the only path (B-0d70:
    // /api/home?host=<dial> used to 400 'has no ssh', so New Session could
    // never learn the device home and defaulted cwd to the LOCAL home).
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
    const cmd = `cd ${shq(d)} 2>/dev/null && pwd && find . -maxdepth 1 -mindepth 1 -printf '%y\\t%s\\t%T@\\t%f\\n' 2>/dev/null | LC_ALL=C sort`;
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
    // reported EVERY existing device dir as nonexistent (the '/Users/xingweil
    // 不存在' report). fsStat gives size/mtime/isDir; a small read-range sniffs
    // binary (NUL byte in the head).
    const dm = await this._dev(id);
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
        if (this._host(id)?.transport === 'dial') throw e;
        /* ssh host: fall through to legacy */
      }
    }
    // size + mtime + type, and a binary sniff via `tr -d '\\0'` (portable
    // across sh/dash/bash — NUL count drops ⇒ binary; $'\\x00' needs bash)
    const cmd = `f=${shq(filePath)}; if [ -d "$f" ]; then echo "dir"; stat -c '%s %Y' "$f"; else echo "file"; stat -c '%s %Y' "$f"; n=$(head -c 8192 "$f" | wc -c); z=$(head -c 8192 "$f" | tr -d '\\000' | wc -c); [ "$n" = "$z" ] && echo TXT || echo BIN; fi`;
    const out = (await this._run(id, cmd)).toString().trim().split('\n');
    const isDirectory = out[0] === 'dir';
    const [size, mtime] = (out[1] || '0 0').split(' ');
    const isBinary = out[2] === 'BIN';
    return { path: filePath, size: parseInt(size) || 0, modified: (parseInt(mtime) || 0) * 1000, isBinary, isDirectory };
  }

  async readText(id, filePath, maxBytes = 10 * 1024 * 1024) {
    const dm = await this._dev(id);
    if (dm) {
      try {
        const abs = await this._devAbs(id, dm, filePath);
        const st = await dm.fsStat(abs);
        if (st.stat.size > maxBytes) { const e = new Error('File too large (>10MB). Use hex viewer.'); e.size = st.stat.size; throw e; }
        const rr = await dm.fsReadRange(abs, 0, st.stat.size);
        return { path: filePath, content: rr.data.toString('utf-8'), size: st.stat.size };
      } catch (e) { if (e.size) throw e; /* too-large is REAL; others → legacy */ }
    }
    const info = await this.info(id, filePath);
    if (info.size > maxBytes) { const e = new Error('File too large (>10MB). Use hex viewer.'); e.size = info.size; throw e; }
    const buf = await this._run(id, `cat ${shq(filePath)}`, { maxBuffer: maxBytes + 1024 });
    return { path: filePath, content: buf.toString('utf-8'), size: info.size };
  }

  async readBinary(id, filePath, offset = 0, length = 65536) {
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
      const child = spawn('ssh', [...this.hosts.sshArgs(h, { multiplex: true }), '--', `mkdir -p "$(dirname ${shq(filePath)})" && cat > ${shq(filePath)}`]);
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(err.trim() || `write failed (${code})`)));
      child.stdin.end(contentBuffer);
    });
    return { success: true };
  }

  async mkdir(id, dirPath) {
    const dm = await this._dev(id);
    if (dm) { try { await dm.fsMkdir(await this._devAbs(id, dm, dirPath)); return { success: true }; } catch { } }
    await this._run(id, `mkdir -p ${shq(dirPath)}`); return { success: true };
  }

  async rename(id, from, to) { await this._run(id, `mv -n ${shq(from)} ${shq(to)}`); return { success: true }; }

  async remove(id, target) {
    const dm = await this._dev(id);
    if (dm) { try { await dm.fsRm(await this._devAbs(id, dm, target), true); return { success: true }; } catch { } }
    await this._run(id, `rm -rf ${shq(target)}`); return { success: true };
  }

  async stat(id, target, withDu = false) {
    // dial device fast path (B-0d70 review): `stat -c` / `du -sb` are GNU-only
    // and error on a macOS/BSD device. fsStat gives the portable core; mode is
    // the raw st_mode (rendered client-side), uid/gid/kind aren't in the
    // fs-op — acceptable for Properties on a device.
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
    const cmd = `f=${shq(target)}; stat -c '%s|%Y|%A|%U|%G|%F' "$f"; ${withDu ? '[ -d "$f" ] && du -sb "$f" 2>/dev/null | cut -f1 || echo' : 'echo'}`;
    const out = (await this._run(id, cmd, { timeoutMs: 30000 })).toString().trim().split('\n');
    const [size, mtime, mode, uid, gid, kind] = (out[0] || '').split('|');
    return { path: target, size: parseInt(size) || 0, modified: (parseInt(mtime) || 0) * 1000, mode, uid, gid, kind, du: withDu ? (parseInt(out[1]) || null) : undefined };
  }

  // copy/move WITHIN the same host (cross-host relay handled in files.js)
  async copy(id, from, to) { await this._run(id, `cp -rn ${shq(from)} ${shq(to)}`, { timeoutMs: 120000 }); return { success: true }; }
  async move(id, from, to) { await this._run(id, `mv -n ${shq(from)} ${shq(to)}`, { timeoutMs: 120000 }); return { success: true }; }

  // Stream a remote file to an HTTP response (download / raw viewer)
  downloadTo(id, filePath, res, { attachment = false } = {}) {
    const child = this._spawn(id, `cat ${shq(filePath)}`);
    if (attachment) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath).replace(/"/g, '')}"`);
    child.stdout.pipe(res);
    child.stderr.on('data', () => {});
    child.on('close', (code) => { if (code !== 0 && !res.headersSent) res.status(404).end(); });
  }

  // Stream a folder as a zip (download-zip)
  downloadZipTo(id, dirPath, res) {
    const parent = path.posix.dirname(dirPath), base = path.posix.basename(dirPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${base.replace(/"/g, '')}.zip"`);
    const child = this._spawn(id, `cd ${shq(parent)} && zip -r - ${shq(base)}`);
    child.stdout.pipe(res);
    child.stderr.on('data', () => {});
  }

  // Upload a local buffer/stream to a remote path (write covers buffers)
  async uploadBuffer(id, destPath, buffer) { return this.write(id, destPath, buffer); }

  // Archives
  async archiveList(id, archivePath) {
    const ap = shq(archivePath);
    const cmd = `case ${ap} in *.zip) unzip -l ${ap} 2>/dev/null | awk 'NR>3{if($4)print $4}' | head -20000;; *) tar -tf ${ap} 2>/dev/null | head -20000;; esac`;
    const out = (await this._run(id, cmd, { timeoutMs: 30000 })).toString();
    return { entries: out.split('\n').filter(Boolean).filter(e => e !== '----') };
  }
  async archiveExtract(id, archivePath, destDir) {
    const ap = shq(archivePath), dd = shq(destDir);
    const cmd = `mkdir -p ${dd} && case ${ap} in *.zip) unzip -n ${ap} -d ${dd};; *.tar.gz|*.tgz) tar -xzkf ${ap} -C ${dd};; *.tar) tar -xkf ${ap} -C ${dd};; *) tar -xkf ${ap} -C ${dd};; esac`;
    await this._run(id, cmd, { timeoutMs: 300000 });
    return { success: true };
  }
  async makeArchive(id, destPath, parentDir, names) {
    const list = names.map(shq).join(' ');
    const dp = shq(destPath);
    const cmd = `cd ${shq(parentDir)} && case ${dp} in *.zip) zip -r ${dp} ${list};; *.tar.gz|*.tgz) tar -czf ${dp} ${list};; *.tar) tar -cf ${dp} ${list};; *.tar.xz) tar -cJf ${dp} ${list};; esac`;
    await this._run(id, cmd, { timeoutMs: 300000 });
    return { success: true };
  }

  // Directory autocomplete (delegated — HostManager already has it)
  dirComplete(id, input) { return this.hosts.dirComplete(id, input); }
}

module.exports = { RemoteFs };
