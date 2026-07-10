/**
 * File System API routes — file browsing, content read/write, upload/download,
 * clipboard image paste, binary chunks, Excel/Word preview.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const multer = require('multer');

const router = express.Router();

function expandTilde(p) {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.substring(1));
  return p;
}
function safePath(p) { return path.resolve(expandTilde(p)); }

// Files cross-host: when ?host=<id> is present, dispatch to the RemoteFs
// (ssh-backed) instead of the local filesystem. rfs(req) returns the
// RemoteFs instance + host id, or null for local.
function rfs(req) {
  const host = req.query.host || req.body?.host;
  if (!host) return null;
  const inst = req.app.locals.getRemoteFs?.();
  return inst ? { fs: inst, host } : null;
}
// remote paths are used verbatim (no local path.resolve — they live on the
// remote); '~' expands remotely inside RemoteFs
const remotePath = (p) => String(p || '~');

router.get('/api/home', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json({ home: await R.fs.home(R.host) }); } catch (e) { return res.status(400).json({ error: e.message }); } }
  res.json({ home: os.homedir(), authEnabled: !!req.app.locals.authEnabled });
});

// System monospace fonts via fc-list (cached)
let _cachedMonoFonts = null;
router.get('/api/fonts', (req, res) => {
  if (_cachedMonoFonts) return res.json({ fonts: _cachedMonoFonts });
  try {
    const out = execFileSync('fc-list', [':spacing=mono', 'family'], { encoding: 'utf-8', timeout: 3000 });
    const fonts = [...new Set(
      out.trim().split('\n')
        .map(line => line.split(',')[0].trim())
        .filter(f => f && !/emoji|sign/i.test(f))
    )].sort((a, b) => a.localeCompare(b));
    _cachedMonoFonts = fonts;
    res.json({ fonts });
  } catch {
    res.json({ fonts: [] });
  }
});

// Directory autocomplete — returns dirs matching partial path, with 500ms timeout
router.get('/api/dir-complete', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json({ suggestions: await R.fs.dirComplete(R.host, req.query.path || '') }); } catch { return res.json({ suggestions: [] }); } }
  const input = req.query.path || '';
  const timeout = setTimeout(() => { if (!res.headersSent) res.json({ suggestions: [] }); }, 500);

  try {
    const expanded = expandTilde(input);
    const lastSlash = expanded.lastIndexOf('/');
    const parentDir = lastSlash >= 0 ? expanded.substring(0, lastSlash) || '/' : '.';
    const prefix = lastSlash >= 0 ? expanded.substring(lastSlash + 1).toLowerCase() : expanded.toLowerCase();
    const resolved = path.resolve(parentDir);

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = [];
    for (const e of entries) {
      if (!e.isDirectory() && !(e.isSymbolicLink() && (() => { try { return fs.statSync(path.join(resolved, e.name)).isDirectory(); } catch { return false; } })())) continue;
      if (e.name.startsWith('.') && !prefix.startsWith('.')) continue;
      if (prefix && !e.name.toLowerCase().startsWith(prefix)) continue;
      dirs.push(path.join(resolved, e.name));
      if (dirs.length >= 20) break;
    }
    clearTimeout(timeout);
    if (!res.headersSent) res.json({ suggestions: dirs });
  } catch {
    clearTimeout(timeout);
    if (!res.headersSent) res.json({ suggestions: [] });
  }
});

router.get('/api/files', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.list(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const dirPath = safePath(req.query.path || os.homedir());
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map(e => {
      let stat = null;
      try { stat = fs.statSync(path.join(dirPath, e.name)); } catch {}
      return {
        name: e.name,
        isDirectory: e.isDirectory() || (e.isSymbolicLink() && stat?.isDirectory()),
        size: stat?.size || 0,
        modified: stat?.mtimeMs || 0,
        created: stat?.birthtimeMs || 0,
      };
    });
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ path: dirPath, items });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// File info (size + binary detection) without reading full content
router.get('/api/file/info', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.info(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const filePath = safePath(req.query.path);
  try {
    const stat = fs.statSync(filePath);
    let isBinary = false;
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      for (let i = 0; i < bytesRead; i++) { if (buf[i] === 0) { isBinary = true; break; } }
    } catch {}
    res.json({ path: filePath, size: stat.size, modified: stat.mtimeMs, isBinary, isDirectory: stat.isDirectory() });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Read text file content (limit raised to 10MB)
router.get('/api/file/content', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.readText(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json({ error: e.message, size: e.size }); } }
  const filePath = safePath(req.query.path);
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (>10MB). Use hex viewer.', size: stat.size });
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ path: filePath, content, size: stat.size });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Read binary file chunk as raw bytes
router.get('/api/file/binary', async (req, res) => {
  const offset = parseInt(req.query.offset) || 0;
  const length = Math.min(parseInt(req.query.length) || 65536, 1048576); // max 1MB per chunk
  const R = rfs(req);
  if (R) {
    try {
      const info = await R.fs.info(R.host, remotePath(req.query.path));
      const buf = await R.fs.readBinary(R.host, remotePath(req.query.path), offset, length);
      res.set({ 'Content-Type': 'application/octet-stream', 'X-File-Size': info.size, 'X-Offset': offset, 'X-Bytes-Read': buf.length });
      return res.send(buf);
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const filePath = safePath(req.query.path);
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buf, 0, length, offset);
    fs.closeSync(fd);
    const stat = fs.statSync(filePath);
    res.set({ 'Content-Type': 'application/octet-stream', 'X-File-Size': stat.size, 'X-Offset': offset, 'X-Bytes-Read': bytesRead });
    res.send(buf.slice(0, bytesRead));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Serve raw files (PDF, images, etc.)
router.get('/api/file/raw', (req, res) => {
  const R = rfs(req);
  if (R) return R.fs.downloadTo(R.host, remotePath(req.query.path), res);
  const filePath = safePath(req.query.path);
  try {
    res.sendFile(filePath);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Path-based file serving — enables <base href> for HTML preview.
// /api/file/serve/home/user/project/style.css → serves /home/user/project/style.css
// This allows relative paths in HTML previews (CSS, images, fonts, JS) to resolve correctly.
router.get('/api/file/serve/*', (req, res) => {
  const filePath = '/' + req.params[0]; // reconstruct absolute path
  try {
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Download file
router.get('/api/download', (req, res) => {
  const R = rfs(req);
  if (R) return R.fs.downloadTo(R.host, remotePath(req.query.path), res, { attachment: true });
  const filePath = safePath(req.query.path);
  try {
    res.download(filePath);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Preview Excel files
router.get('/api/file/excel', (req, res) => {
  const filePath = safePath(req.query.path);
  try {
    // Size guard (like /api/file/content's 10MB cap): XLSX.readFile parses the
    // whole workbook synchronously — a huge file blocks the entire server
    const stat = fs.statSync(filePath);
    if (stat.size > 20 * 1024 * 1024) {
      return res.status(413).json({ error: `Excel file too large to preview (${(stat.size / 1048576).toFixed(1)} MB > 20 MB)` });
    }
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    // Client renders at most 5000 rows per sheet — don't serialize more
    const sheets = workbook.SheetNames.map(name => ({
      name,
      data: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).slice(0, 5000),
    }));
    res.json({ sheets });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Preview Word files
router.get('/api/file/docx', (req, res) => {
  const filePath = safePath(req.query.path);
  try {
    const mammoth = require('mammoth');
    mammoth.convertToHtml({ path: filePath }).then(result => {
      res.json({ html: result.value });
    }).catch(err => res.status(400).json({ error: err.message }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/api/mkdir', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.mkdir(R.host, remotePath(req.body.path))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  try { fs.mkdirSync(safePath(req.body.path), { recursive: true }); res.json({ success: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/api/file/write', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.write(R.host, remotePath(req.body.path), Buffer.from(req.body.content || ''))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  try { fs.writeFileSync(safePath(req.body.path), req.body.content || ''); res.json({ success: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/api/rename', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.rename(R.host, remotePath(req.body.oldPath), remotePath(req.body.newPath))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  try { fs.renameSync(safePath(req.body.oldPath), safePath(req.body.newPath)); res.json({ success: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/api/file', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.remove(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const filePath = safePath(req.query.path);
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true });
    else fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// File upload
const upload = multer({ dest: '/tmp/claude-webui-uploads/' });
router.post('/api/upload', upload.array('files'), async (req, res) => {
  const destDir = req.body.destDir || os.homedir();
  const preservePaths = req.body.preservePaths === '1'; // folder upload: keep relative paths
  // Client sends correct UTF-8 filenames as JSON to avoid multer encoding issues
  let clientNames = [];
  try { clientNames = JSON.parse(req.body.fileNames || '[]'); } catch {}
  // Remote upload: stream each temp file to the host over ssh
  const R = rfs(req);
  if (R) {
    try {
      const results = [];
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const name = clientNames[i] || file.originalname;
        if (name.includes('..')) throw new Error('Invalid file name: ' + name);
        const dest = (destDir.endsWith('/') ? destDir : destDir + '/') + name;
        await R.fs.write(R.host, dest, fs.readFileSync(file.path));
        fs.unlinkSync(file.path);
        results.push({ name, path: dest, size: file.size });
      }
      return res.json({ success: true, files: results });
    } catch (e) {
      for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
      return res.status(400).json({ error: e.message });
    }
  }
  try {
    const results = [];
    const destRoot = path.resolve(destDir);
    fs.mkdirSync(destRoot, { recursive: true }); // ensure target exists (plain-file uploads to a fresh dir)
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const name = clientNames[i] || file.originalname;
      const dest = path.resolve(destRoot, name);
      // Confine to the chosen folder: a name containing ../ would otherwise
      // silently write outside the upload destination
      if (dest !== destRoot && !dest.startsWith(destRoot + path.sep)) {
        throw new Error(`Invalid file name: ${name}`);
      }
      // For folder uploads, create intermediate directories
      if (preservePaths && name.includes('/')) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
      }
      fs.copyFileSync(file.path, dest);
      fs.unlinkSync(file.path);
      results.push({ name, path: dest, size: file.size });
    }
    res.json({ success: true, files: results });
  } catch (err) {
    // Clean up remaining multer temp files on failure (they leaked in /tmp)
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    res.status(400).json({ error: err.message });
  }
});

// Paste image from clipboard → save to temp file + set X clipboard via xclip
router.post('/api/paste-image', (req, res) => {
  try {
    const { dataUrl } = req.body; // "data:image/png;base64,..."
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Not an image' });
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid data URL' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const mimeType = `image/${match[1]}`;
    const buf = Buffer.from(match[2], 'base64');
    const tmpPath = path.join(os.tmpdir(), `claude-paste-${Date.now()}.${ext}`);
    fs.writeFileSync(tmpPath, buf);
    // Set system clipboard with image — macOS uses osascript, Linux uses xclip
    const isMac = process.platform === 'darwin';
    try {
      if (isMac) {
        execFileSync('osascript', ['-e', `set the clipboard to (read POSIX file "${tmpPath}" as «class PNGf»)`], { timeout: 5000 });
        res.json({ path: tmpPath, ready: true });
      } else {
        // Use the display the server PROBED at startup (app.locals.xEnv) — the
        // inherited DISPLAY is often stale, and XWayland needs the compositor's
        // XAUTHORITY cookie or xclip fails with "Can't open display". If the
        // cycle fails, re-probe ONCE and retry: a compositor restart rotates
        // the cookie out from under a long-running server (real incident).
        const attempt = (retriesLeft) => {
          const xEnv = req.app.locals.xEnv || {};
          const clipEnv = { ...process.env, DISPLAY: xEnv.DISPLAY || process.env.DISPLAY || ':0' };
          if (xEnv.XAUTHORITY) clipEnv.XAUTHORITY = xEnv.XAUTHORITY;
          const cp = spawn('bash', ['-c', `cat "${tmpPath}" | xclip -selection clipboard -t ${mimeType}`], {
            env: clipEnv, detached: true, stdio: 'ignore',
          });
          cp.unref();
          const pollStart = Date.now();
          const poll = () => {
            try {
              const out = execFileSync('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], {
                env: clipEnv, encoding: 'utf-8', timeout: 1000,
              });
              if (out.includes('image/')) return res.json({ path: tmpPath, ready: true });
            } catch {}
            if (Date.now() - pollStart < 5000) return setTimeout(poll, 200);
            if (retriesLeft > 0 && req.app.locals.refreshXEnv) {
              req.app.locals.refreshXEnv();
              return attempt(retriesLeft - 1);
            }
            res.json({ path: tmpPath, ready: false });
          };
          setTimeout(poll, 300);
        };
        attempt(1);
      }
    } catch {
      res.json({ path: tmpPath, ready: false });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quote-aware CSV field split (commas inside "..." stay in one field,
// "" unescapes to "). Embedded newlines inside quotes are not supported —
// the endpoint streams line-by-line by design.
function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', inQ = false, wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') {
      inQ = true; wasQuoted = true;
    } else if (ch === sep) {
      out.push(wasQuoted ? cur : cur.trim()); cur = ''; wasQuoted = false;
    } else cur += ch;
  }
  out.push(wasQuoted ? cur : cur.trim());
  return out;
}

// CSV/TSV streaming: read only requested row range from a file
// Supports large files by reading line-by-line without loading entire file
router.get('/api/file/csv', (req, res) => {
  const filePath = safePath(req.query.path);
  const offset = parseInt(req.query.offset) || 0;
  const limit = parseInt(req.query.limit) || 100;
  const sep = req.query.sep || ',';

  try {
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    let lineNum = 0, headerRow = null;
    const rows = [];
    let partial = '';
    let totalLines = 0;
    let done = false;
    let bytesConsumed = 0; // bytes covered by fully-processed lines (for the size-based estimate)

    stream.on('data', (chunk) => {
      if (done) return;
      const lines = (partial + chunk).split('\n');
      partial = lines.pop(); // last partial line
      for (const line of lines) {
        bytesConsumed += Buffer.byteLength(line) + 1;
        const trimmed = line.replace(/\r$/, '');
        if (!trimmed) continue;
        if (lineNum === 0) {
          headerRow = splitCsvLine(trimmed, sep);
        } else if (lineNum > offset && rows.length < limit) {
          rows.push(splitCsvLine(trimmed, sep));
        }
        lineNum++;
        totalLines = lineNum;
        // Stop reading early if we have enough data and want a rough total estimate
        if (rows.length >= limit && lineNum > offset + limit + 10000) {
          done = true;
          stream.destroy();
          break;
        }
      }
    });

    stream.on('end', () => {
      if (partial.trim()) { totalLines++; if (lineNum > offset && rows.length < limit) rows.push(splitCsvLine(partial, sep)); }
      res.json({ header: headerRow, rows, offset: offset, total: totalLines, fileSize: stat.size });
    });
    stream.on('close', () => {
      if (!res.headersSent) {
        // Estimate total rows from average bytes/line over what we actually
        // read. (The old formula divided stat.size by stat.size/totalLines,
        // which algebraically just returned totalLines — large CSVs reported
        // ~10k rows no matter their real size.)
        const bytesPerLine = Math.max(1, bytesConsumed) / Math.max(1, totalLines);
        const estimatedTotal = Math.round(stat.size / bytesPerLine);
        res.json({ header: headerRow, rows, offset, total: done ? estimatedTotal : totalLines, fileSize: stat.size, estimated: done });
      }
    });
    stream.on('error', (err) => { if (!res.headersSent) res.status(400).json({ error: err.message }); });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Format code via server-side CLI tools (for languages not supported by Prettier)
router.post('/api/format', (req, res) => {
  const { code, language, filePath } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'code and language required' });

  // Map language → CLI formatter command
  const formatters = {
    python: { cmd: 'black', args: ['-', '-q', '--fast'], stdin: true },
    shell: { cmd: 'shfmt', args: ['-'], stdin: true },
    go: { cmd: 'gofmt', args: [], stdin: true },
    rust: { cmd: 'rustfmt', args: ['--edition', '2021'], stdin: true },
  };

  // Try ruff first for Python (faster), fall back to black
  const fmt = formatters[language];
  if (!fmt) return res.status(400).json({ error: `No server-side formatter for ${language}` });

  const tryFormat = (cmd, args) => {
    try {
      const result = execFileSync(cmd === 'ruff' ? 'ruff' : cmd,
        cmd === 'ruff' ? ['format', '-'] : args,
        { input: code, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      return result;
    } catch (err) {
      if (err.stdout) return err.stdout; // some formatters return non-zero but still output
      throw err;
    }
  };

  try {
    let formatted;
    if (language === 'python') {
      // Try ruff format first (fast), fall back to black
      try { formatted = tryFormat('ruff', ['format', '-']); }
      catch { formatted = tryFormat('black', ['-', '-q', '--fast']); }
    } else {
      formatted = tryFormat(fmt.cmd, fmt.args);
    }
    res.json({ formatted });
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message;
    res.status(422).json({ error: stderr.split('\n')[0]?.substring(0, 200) || 'Format failed' });
  }
});


// ── Archive operations (zip / tar family via system tools) ──
// All subprocess calls use execFile with arg arrays — no shell interpolation.
const { execFile } = require('child_process');

function archiveType(p) {
  const n = p.toLowerCase();
  if (n.endsWith('.zip')) return 'zip';
  if (n.endsWith('.tar') || n.endsWith('.tar.gz') || n.endsWith('.tgz')
    || n.endsWith('.tar.bz2') || n.endsWith('.tbz2') || n.endsWith('.tar.xz') || n.endsWith('.txz')) return 'tar';
  return null;
}

// Create an archive from files/folders that share one parent directory.
// Runs with cwd = parent so the archive holds clean relative paths.
router.post('/api/archive', async (req, res) => {
  const { paths, dest, overwrite } = req.body || {};
  if (!Array.isArray(paths) || !paths.length || !dest) return res.status(400).json({ error: 'paths[] and dest required' });
  const R = rfs(req);
  if (R) {
    try {
      const parent = path.posix.dirname(remotePath(paths[0]));
      const names = paths.map(p => path.posix.basename(p));
      await R.fs.makeArchive(R.host, remotePath(dest), parent, names);
      return res.json({ success: true, dest });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const absPaths = paths.map(safePath);
  const destPath = safePath(dest);
  const parent = path.dirname(absPaths[0]);
  if (!absPaths.every(p => path.dirname(p) === parent)) return res.status(400).json({ error: 'all paths must share one parent directory' });
  const names = absPaths.map(p => path.basename(p));
  if (fs.existsSync(destPath)) {
    if (!overwrite) return res.status(409).json({ error: 'exists', dest: destPath });
    try { fs.unlinkSync(destPath); } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const type = archiveType(destPath);
  let cmd, args;
  if (type === 'zip') { cmd = 'zip'; args = ['-r', '-q', '-y', destPath, ...names]; }
  else if (type === 'tar') {
    const n = destPath.toLowerCase();
    const flag = n.endsWith('.tar') ? '-cf' : (n.endsWith('.bz2') || n.endsWith('.tbz2')) ? '-cjf' : (n.endsWith('.xz') || n.endsWith('.txz')) ? '-cJf' : '-czf';
    cmd = 'tar'; args = [flag, destPath, ...names];
  } else return res.status(400).json({ error: 'dest must end in .zip, .tar, .tar.gz/.tgz, .tar.bz2 or .tar.xz' });
  execFile(cmd, args, { cwd: parent, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => {
    if (err) { try { fs.unlinkSync(destPath); } catch {} return res.status(400).json({ error: (stderr || err.message).split('\n')[0] }); }
    let size = 0; try { size = fs.statSync(destPath).size; } catch {}
    res.json({ success: true, dest: destPath, size });
  });
});

// List archive contents (preview without extracting)
router.get('/api/archive/list', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.archiveList(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const fp = safePath(req.query.path || '');
  const type = archiveType(fp);
  if (!type) return res.status(400).json({ error: 'unsupported archive type' });
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  const MAX = 20000;
  const opts = { timeout: 60000, maxBuffer: 64 * 1024 * 1024 };
  if (type === 'zip') {
    execFile('unzip', ['-l', '-qq', fp], opts, (err, out) => {
      if (err) return res.status(400).json({ error: 'failed to read zip: ' + (err.message || '').split('\n')[0] });
      const entries = [];
      for (const line of out.split('\n')) {
        // "     1234  2026-07-03 12:00   dir/file.txt" (skip the trailing totals row)
        const m = line.match(/^\s*(\d+)\s+[\d-]+\s+[\d:]+\s+(.+)$/);
        if (!m) continue;
        const name = m[2];
        entries.push({ name, size: parseInt(m[1]), isDirectory: name.endsWith('/') });
        if (entries.length > MAX) break;
      }
      res.json({ type, entries: entries.slice(0, MAX), total: entries.length, truncated: entries.length > MAX });
    });
  } else {
    execFile('tar', ['-tvf', fp], opts, (err, out) => {
      if (err) return res.status(400).json({ error: 'failed to read tar: ' + (err.message || '').split('\n')[0] });
      const entries = [];
      for (const line of out.split('\n')) {
        // "drwxr-xr-x user/grp 0 2026-07-03 12:00 dir/"
        const m = line.match(/^([\-dlrwxsStT]{10})\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/);
        if (!m) continue;
        let name = m[3];
        const arrow = name.indexOf(' -> '); // symlink target
        if (arrow > 0) name = name.substring(0, arrow);
        entries.push({ name, size: parseInt(m[2]), isDirectory: m[1][0] === 'd' });
        if (entries.length > MAX) break;
      }
      res.json({ type, entries: entries.slice(0, MAX), total: entries.length, truncated: entries.length > MAX });
    });
  }
});

// Extract ONE entry to a temp file and return its path — the client then opens
// it through the normal viewer pipeline (editor / image / pdf / …).
router.post('/api/archive/extract-entry', (req, res) => {
  const { path: ap, entry } = req.body || {};
  if (!ap || !entry) return res.status(400).json({ error: 'path and entry required' });
  const fp = safePath(ap);
  const type = archiveType(fp);
  if (!type) return res.status(400).json({ error: 'unsupported archive type' });
  if (entry.endsWith('/')) return res.status(400).json({ error: 'cannot open a directory entry' });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webui-archive-'));
  const outPath = path.join(tmpDir, path.basename(entry) || 'entry');
  const outStream = fs.createWriteStream(outPath);
  let cmd, args;
  if (type === 'zip') {
    // unzip treats [ ] * ? as globs — escape for a literal member name
    const literal = entry.replace(/([\[\]*?])/g, '\\$1');
    cmd = 'unzip'; args = ['-p', fp, literal];
  } else { cmd = 'tar'; args = ['-xOf', fp, entry]; }
  // spawn (not execFile): execFile buffers stdout internally and maxBuffer
  // kills the child — for streaming, pipe from a spawned process instead
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.pipe(outStream);
  let written = 0, killed = false;
  const CAP = 200 * 1024 * 1024;
  const timer = setTimeout(() => { killed = true; child.kill(); }, 120000);
  child.stdout.on('data', (c) => { written += c.length; if (written > CAP && !killed) { killed = true; child.kill(); } });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (killed) { try { fs.rmSync(tmpDir, { recursive: true }); } catch {} return res.status(413).json({ error: 'entry too large (>200MB)' }); }
    if (code !== 0) { try { fs.rmSync(tmpDir, { recursive: true }); } catch {} return res.status(400).json({ error: `extract failed (exit ${code})` }); }
    outStream.end(() => res.json({ path: outPath, size: written }));
  });
});

// Extract a whole archive into dest
router.post('/api/archive/extract', async (req, res) => {
  const { path: ap, dest, overwrite } = req.body || {};
  if (!ap || !dest) return res.status(400).json({ error: 'path and dest required' });
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.archiveExtract(R.host, remotePath(ap), remotePath(dest))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const fp = safePath(ap);
  const destDir = safePath(dest);
  const type = archiveType(fp);
  if (!type) return res.status(400).json({ error: 'unsupported archive type' });
  try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) { return res.status(400).json({ error: e.message }); }
  let cmd, args;
  if (type === 'zip') { cmd = 'unzip'; args = [overwrite ? '-o' : '-n', '-q', fp, '-d', destDir]; }
  else { cmd = 'tar'; args = [overwrite ? '-xf' : '-xkf', fp, '-C', destDir]; }
  execFile(cmd, args, { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => {
    // tar -k exits non-zero when files already existed — treat as success (skip-existing semantics)
    if (err && !(cmd === 'tar' && !overwrite && /already exists/i.test(stderr || ''))) {
      return res.status(400).json({ error: (stderr || err.message).split('\n')[0] });
    }
    res.json({ success: true, dest: destDir });
  });
});

// Cross-host transfer relay: stream src (local or remote) → dest (local or
// remote) through the server. Smart selection: same host uses remote cp/mv
// (handled below); different hosts (or host↔local) stream here.
async function crossHostTransfer(req, res, { move }) {
  const { src, dest, srcHost, destHost, overwrite } = req.body || {};
  if (!src || !dest) return res.status(400).json({ error: 'src and dest required' });
  const inst = req.app.locals.getRemoteFs?.();
  const isDir = async (host, p) => host ? (await inst.info(host, p)).isDirectory : fs.statSync(safePath(p)).isDirectory();
  let dir;
  try { dir = await isDir(srcHost, src); } catch (e) { return res.status(400).json({ error: 'source not found: ' + e.message }); }
  const base = path.posix.basename(src.replace(/\/+$/, ''));
  const destPath = dest.endsWith('/') ? dest + base : dest;
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  // NOTE: inst.info() exits 0 even for missing paths (its trailing echo wins),
  // so existence needs a real `[ -e ]` probe.
  const exists = async (host, p) => host ? await inst._run(host, `[ -e ${shq(p)} ]`).then(() => true, () => false) : fs.existsSync(safePath(p));
  if (!overwrite && await exists(destHost, destPath)) return res.status(409).json({ error: 'exists', dest: destPath });
  if (dir) {
    // Folder transfer: tar stream from the source side piped straight into a
    // tar extract on the destination side (through the server) — no temp
    // archive, arbitrary trees, preserves permissions/symlinks.
    const { spawn } = require('child_process');
    const srcParent = path.posix.dirname(src.replace(/\/+$/, ''));
    const destParent = path.posix.dirname(destPath);
    const destBase = path.posix.basename(destPath);
    let srcChild;
    if (srcHost) srcChild = inst._spawn(srcHost, `cd ${shq(srcParent)} && tar -cf - ${shq(base)}`);
    else { const sp = safePath(src); srcChild = spawn('tar', ['-cf', '-', path.basename(sp)], { cwd: path.dirname(sp) }); }
    try {
      let destChild, localRename = null;
      if (destHost) {
        const h = inst._host(destHost);
        // extract lands as <base>; rename remotely if the target name differs
        const post = destBase === base ? '' : ` && mv ${shq(destParent + '/' + base)} ${shq(destPath)}`;
        destChild = spawn('ssh', [...inst.hosts.sshArgs(h), '--', `mkdir -p ${shq(destParent)} && tar -xf - -C ${shq(destParent)}${post}`]);
      } else {
        const dp = safePath(destPath), dParent = path.dirname(dp);
        fs.mkdirSync(dParent, { recursive: true });
        destChild = spawn('tar', ['-xf', '-', '-C', dParent]);
        if (path.basename(dp) !== base) localRename = { from: path.join(dParent, base), to: dp };
      }
      srcChild.stdout.pipe(destChild.stdin);
      let srcErr = '', dstErr = '';
      srcChild.stderr?.on('data', d => { srcErr += d; });
      destChild.stderr?.on('data', d => { dstErr += d; });
      await Promise.all([
        new Promise((resolve, reject) => srcChild.on('close', c => c === 0 ? resolve() : reject(new Error('source read failed: ' + (srcErr.trim().slice(0, 200) || c))))),
        new Promise((resolve, reject) => destChild.on('close', c => c === 0 ? resolve() : reject(new Error('extract failed: ' + (dstErr.trim().slice(0, 200) || c))))),
      ]);
      if (localRename) fs.renameSync(localRename.from, localRename.to);
      if (move) { if (srcHost) await inst.remove(srcHost, src); else fs.rmSync(safePath(src), { recursive: true, force: true }); }
      return res.json({ success: true, dest: destPath });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  // reader stream
  let reader;
  if (srcHost) reader = inst._spawn(srcHost, `cat '${String(src).replace(/'/g, `'\\''`)}'`).stdout;
  else reader = fs.createReadStream(safePath(src));
  try {
    if (destHost) {
      const h = inst._host(destHost);
      const { spawn } = require('child_process');
      const w = spawn('ssh', [...inst.hosts.sshArgs(h), '--', `mkdir -p "$(dirname '${String(destPath).replace(/'/g, `'\\''`)}')" && cat > '${String(destPath).replace(/'/g, `'\\''`)}'`]);
      reader.pipe(w.stdin);
      await new Promise((resolve, reject) => { w.on('close', c => c === 0 ? resolve() : reject(new Error('remote write failed'))); reader.on('error', reject); });
    } else {
      const dPath = safePath(destPath);
      fs.mkdirSync(path.dirname(dPath), { recursive: true });
      await new Promise((resolve, reject) => { const w = fs.createWriteStream(dPath); reader.pipe(w); w.on('finish', resolve); w.on('error', reject); reader.on('error', reject); });
    }
    if (move) { if (srcHost) await inst.remove(srcHost, src); else fs.rmSync(safePath(src), { force: true }); }
    res.json({ success: true, dest: destPath });
  } catch (e) { res.status(400).json({ error: e.message }); }
}

// Copy file/dir (recursive). dest is the FULL target path.
router.post('/api/file/copy', async (req, res) => {
  const { srcHost, destHost } = req.body || {};
  // cross-host (or host↔local) → relay stream through the server
  if ((srcHost || destHost) && srcHost !== destHost) return crossHostTransfer(req, res, { move: false });
  const R = rfs(req) || (srcHost ? { fs: req.app.locals.getRemoteFs(), host: srcHost } : null);
  if (R) { try { return res.json(await R.fs.copy(R.host, remotePath(req.body.src), remotePath(req.body.dest))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const { src, dest, overwrite } = req.body || {};
  if (!src || !dest) return res.status(400).json({ error: 'src and dest required' });
  const s = safePath(src), d = safePath(dest);
  if (s === d) return res.status(400).json({ error: 'source and destination are the same' });
  if (d.startsWith(s + '/')) return res.status(400).json({ error: 'cannot copy a folder into itself' });
  if (fs.existsSync(d) && !overwrite) return res.status(409).json({ error: 'exists', dest: d });
  try {
    fs.cpSync(s, d, { recursive: true, force: !!overwrite, errorOnExist: !overwrite });
    res.json({ success: true, dest: d });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Move file/dir. dest is the FULL target path. Falls back to copy+rm across devices.
router.post('/api/file/move', async (req, res) => {
  const { srcHost, destHost } = req.body || {};
  if ((srcHost || destHost) && srcHost !== destHost) return crossHostTransfer(req, res, { move: true });
  const R = srcHost ? { fs: req.app.locals.getRemoteFs(), host: srcHost } : null;
  if (R) { try { return res.json(await R.fs.move(R.host, remotePath(req.body.src), remotePath(req.body.dest))); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const { src, dest, overwrite } = req.body || {};
  if (!src || !dest) return res.status(400).json({ error: 'src and dest required' });
  const s = safePath(src), d = safePath(dest);
  if (s === d) return res.json({ success: true, dest: d }); // no-op
  if (d.startsWith(s + '/')) return res.status(400).json({ error: 'cannot move a folder into itself' });
  if (fs.existsSync(d) && !overwrite) return res.status(409).json({ error: 'exists', dest: d });
  try {
    if (fs.existsSync(d) && overwrite) fs.rmSync(d, { recursive: true, force: true });
    try { fs.renameSync(s, d); }
    catch (e) {
      if (e.code !== 'EXDEV') throw e;
      fs.cpSync(s, d, { recursive: true });
      fs.rmSync(s, { recursive: true, force: true });
    }
    res.json({ success: true, dest: d });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Stream a folder (or file) as a zip download — no temp archive on disk
router.get('/api/download-zip', (req, res) => {
  const R = rfs(req);
  if (R) return R.fs.downloadZipTo(R.host, remotePath(req.query.path), res);
  const fp = safePath(req.query.path || '');
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  const base = path.basename(fp) || 'archive';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(base)}.zip`);
  const child = spawn('zip', ['-r', '-q', '-y', '-', base], { cwd: path.dirname(fp), stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.pipe(res);
  child.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end(); });
  child.on('close', (code) => { if (code !== 0 && !res.writableEnded) res.end(); });
  res.on('close', () => { try { child.kill(); } catch {} });
});

// Extended properties: stat + optional recursive size/count for directories
router.get('/api/file/stat', async (req, res) => {
  const R = rfs(req);
  if (R) {
    try {
      const s = await R.fs.stat(R.host, remotePath(req.query.path), !!req.query.du);
      return res.json({ path: s.path, isDirectory: s.kind === 'directory', size: s.size, modified: s.modified, created: 0, mode: s.mode, uid: s.uid, gid: s.gid, du: s.du });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const fp = safePath(req.query.path || '');
  try {
    const st = fs.statSync(fp);
    const out = {
      path: fp,
      isDirectory: st.isDirectory(),
      size: st.size,
      modified: st.mtimeMs,
      created: st.birthtimeMs,
      mode: '0' + (st.mode & 0o777).toString(8),
      uid: st.uid, gid: st.gid,
    };
    if (st.isDirectory()) {
      try { out.entryCount = fs.readdirSync(fp).length; } catch {}
      if (req.query.du) {
        // du can crawl for a while on huge trees — bounded, best-effort
        return execFile('du', ['-sb', fp], { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, o) => {
          if (!err) { const n = parseInt(o.split('\t')[0]); if (Number.isFinite(n)) out.duSize = n; }
          res.json(out);
        });
      }
    }
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
