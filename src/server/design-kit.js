'use strict';
// Design kit (2.366.0, owner request: "/design 的画布在 ChatView 里走 VibeSpace
// 自己的发布流程"): the pieces behind Claude Code's bundled `/design` skill,
// made usable from a stream-json (chat) session and published to THIS
// instance instead of claude.ai.
//
// WHY THIS EXISTS. The bundled skill is reachable only from the TUI picker:
// in stream-json `/design <brief>` resolves to the consent command (owner-
// tested) and the Skill tool refuses it outright ("design is a built-in CLI
// command, not a skill"). The skill is three things: a seeding helper
// (`seed-canvas.mjs`), a ~2 MiB precompiled editor payload
// (`payload.template.html`) and ~55 KB of instructions. The CLI extracts the
// first two to /tmp/claude-<uid>/bundled-skills/<ver>/<hash>/design/ when
// the slash command runs; the instructions are injected as a user message
// and live nowhere on disk. All three are embedded in the CLI binary: the
// payload as a raw bun asset (preceded by its asset name), the helper and
// the instructions as JS template literals (backtick-delimited, `\uXXXX` /
// `\xHH` escapes). This module finds them — CLI-extracted dir first (bytes
// the CLI itself wrote), binary extraction as the fallback — writes a
// per-CLI-version kit under data/design-kit/<version>/, and VALIDATES it by
// seeding a sample artboard and running the helper's own `--check`.
//
// NOTHING OF ANTHROPIC'S IS VENDORED: extraction happens on the user's
// machine from the user's installed CLI, per version, at runtime. The one
// thing VibeSpace authors is the ADAPTATION: step 4 ("Publish with the
// Artifact tool …") and the artifact read-back section are replaced by the
// VibeSpace publish step (`vibespace-page publish`). Anchors missing ⇒ the
// kit reports ok:false with a reason (never a silently half-adapted text).
//
// Failure modes are LOUD and end in the status-bar popover: no CLI binary,
// anchors not found (skill layout changed in a new CLI), helper check
// failed. Streaming scans — the binary is ~300 MB and pods are small.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SKILL_ANCHOR = Buffer.from('`---\nname: design\ndescription: "Create a design canvas');
const HELPER_ANCHOR = Buffer.from('`// Design-canvas seeding helper.');
const PAYLOAD_ASSET = Buffer.from('payload.template.html.asset');
const PAYLOAD_START = Buffer.from('<!doctype html', 'utf8');
const CHUNK = 8 * 1024 * 1024;
const MAX_LITERAL = 512 * 1024;     // helper ≈ 37 KB, skill ≈ 57 KB
const MAX_PAYLOAD = 16 * 1024 * 1024;

/** JS template-literal body → string (the escapes the CLI's bundler emits). */
function unescapeTemplate(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i + 1 >= s.length) { out += c; continue; }
    const n = s[i + 1];
    if (n === 'u' && s[i + 2] === '{') { const j = s.indexOf('}', i + 3); out += String.fromCodePoint(parseInt(s.slice(i + 3, j), 16)); i = j; continue; }
    if (n === 'u') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 5; continue; }
    if (n === 'x') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16)); i += 3; continue; }
    if (n === 'n') { out += '\n'; i++; continue; }
    if (n === 't') { out += '\t'; i++; continue; }
    if (n === 'r') { out += '\r'; i++; continue; }
    out += n; i++; // \` \\ \$ and any other escaped char
  }
  return out;
}

/** Find the first occurrence of each needle in a (large) file without
 *  loading it: chunked reads with an overlap of the longest needle. */
async function findOffsets(file, needles) {
  const fh = await fs.promises.open(file, 'r');
  const found = new Map();
  const overlap = Math.max(...needles.map((n) => n.length)) - 1;
  let pos = 0, carry = Buffer.alloc(0);
  try {
    const buf = Buffer.alloc(CHUNK);
    while (found.size < needles.length) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
      if (!bytesRead) break;
      const hay = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      const base = pos - carry.length;
      for (const n of needles) {
        if (found.has(n)) continue;
        const i = hay.indexOf(n);
        if (i >= 0) found.set(n, base + i);
      }
      carry = Buffer.from(hay.subarray(Math.max(0, hay.length - overlap)));
      pos += bytesRead;
    }
  } finally { await fh.close(); }
  return found;
}

/** Every occurrence of one needle (the asset NAME appears in the JS source
 *  too — only the table entry is followed by the bytes). */
async function findAll(file, needle, limit = 16) {
  const fh = await fs.promises.open(file, 'r');
  const hits = [];
  let pos = 0, carry = Buffer.alloc(0);
  try {
    const buf = Buffer.alloc(CHUNK);
    while (hits.length < limit) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
      if (!bytesRead) break;
      const hay = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      const base = pos - carry.length;
      let i = hay.indexOf(needle);
      while (i >= 0 && hits.length < limit) { hits.push(base + i); i = hay.indexOf(needle, i + 1); }
      carry = Buffer.from(hay.subarray(Math.max(0, hay.length - needle.length + 1)));
      pos += bytesRead;
    }
  } finally { await fh.close(); }
  return hits;
}

/** Read from `from` until the first UNESCAPED backtick (template literal end). */
async function readTemplateLiteral(file, from) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    let acc = Buffer.alloc(0), pos = from;
    while (acc.length < MAX_LITERAL) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      acc = Buffer.concat([acc, buf.subarray(0, bytesRead)]);
      pos += bytesRead;
      let i = acc.indexOf(0x60 /* ` */);
      while (i >= 0) {
        let bs = 0; for (let k = i - 1; k >= 0 && acc[k] === 0x5c; k--) bs++;
        if (bs % 2 === 0) return unescapeTemplate(acc.subarray(0, i).toString('utf8'));
        i = acc.indexOf(0x60, i + 1);
      }
    }
    return null;
  } finally { await fh.close(); }
}

/** Read the raw asset: from the first `<!doctype html` after the asset-name
 *  offset up to the first NUL byte (HTML carries none; the table does). */
async function readPayloadAsset(file, nameOffset) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const head = Buffer.alloc(256);
    const { bytesRead } = await fh.read(head, 0, 256, nameOffset);
    const rel = head.subarray(0, bytesRead).indexOf(PAYLOAD_START);
    if (rel < 0) return null;
    let pos = nameOffset + rel, acc = Buffer.alloc(0);
    const buf = Buffer.alloc(1024 * 1024);
    while (acc.length < MAX_PAYLOAD) {
      const r = await fh.read(buf, 0, buf.length, pos);
      if (!r.bytesRead) break;
      const chunk = buf.subarray(0, r.bytesRead);
      const z = chunk.indexOf(0);
      if (z >= 0) return Buffer.concat([acc, chunk.subarray(0, z)]);
      acc = Buffer.concat([acc, chunk]);
      pos += r.bytesRead;
    }
    return null;
  } finally { await fh.close(); }
}

/** The payload asset: the one asset-name occurrence followed by the page bytes. */
async function extractPayload(file) {
  for (const o of await findAll(file, PAYLOAD_ASSET)) {
    const buf = await readPayloadAsset(file, o);
    if (buf) return buf;
  }
  return null;
}

const SAVING_RE = /Where saving is enabled \(the\s+artifact-publish capability[\s\S]*?export is what the user gets\./;
const REEXTRACT_RE = /If a resumed session lost the base\s+directory, re-run `\/design` to re-extract it\./;
const TALK_RE = /^## How to talk to the user about it\s*$/m;
const FOUNDATION_RE = /^## Foundation\s*$/m;
const STEP4_RE = /^4\. \*\*Publish\*\*/m;
const STEP5_RE = /^5\. \*\*Show the design\*\*/m;
const UPDATING_RE = /^## Updating an existing canvas\s*$/m;
const ARTBOARDS_RE = /^## Artboards and canvas\.json\s*$/m;

const VS_BANNER = `> **VibeSpace variant.** This canvas is published to the VibeSpace
> instance you are running in, with \`vibespace-page publish\` (step 4
> below) — NOT to claude.ai. Wherever this document mentions the
> \`Artifact\` tool, \`artifact-capabilities\`, capability rosters,
> \`contract\` pins, WebFetch of an artifact URL or a hosted Save, those
> paths do not exist here; the VibeSpace steps replace them. The hosted
> canvas is view-and-export (PNG/PDF) — there is no online Save in this
> preview, so say so in one line at handover.
`;

const VS_STEP4 = `4. **Publish to VibeSpace.** Run, from the working tree:

   \`\`\`bash
   vibespace-page publish spring-menu-poster.html --title "Spring Menu Poster"
   \`\`\`

   It uploads a snapshot to the VibeSpace server and prints the share
   URL. The page is PRIVATE by default (viewers must be logged in to this
   VibeSpace); \`--public\` opens it to anyone with the link, and the user
   can flip that later from the chat status bar's design popover.
   Re-publishing the SAME file path keeps the SAME URL (iterate freely —
   every publish replaces the snapshot). No Artifact tool, no roster, no
   contract — skip every such instruction in this document. Remember the
   published path and the URL.
`;

const VS_UPDATING = `## Updating an existing canvas

Seeding is not one-shot — updates re-run it. Keep your working files;
to change anything, edit them and re-run step 2 (the helper always seeds
a FRESH copy of \`payload.template.html\`; never edit or re-seed the
already-seeded output file), then \`vibespace-page publish\` the same file
path again — same URL, new snapshot. A VibeSpace-hosted canvas has no
online Save, so there is no artifact read-back, \`--extract\`, version or
conflict flow here: the working files on disk are the only source of
truth. Adding an image is the same move: downsample, \`--image\`,
reference by filename, re-seed, republish.

`;

const VS_SAVING = `Hosted on VibeSpace the canvas is VIEW-AND-EXPORT: viewers get the
read-only editor chrome (pan/zoom, Fit, PNG/PDF export); the in-canvas
Save is refused, so every change is made by editing the working files
and republishing (step 4).`;
const VS_REEXTRACT = 'If a resumed session lost the base directory, run `vibespace-page kit` again — it re-creates it and prints the path.';
const VS_TALK = `## How to talk to the user about it

Hand over the share link (\`vibespace-page publish\` prints it) and a line
or two on what you drafted and assumed — no tour of the editor or the
format until asked. Facts for when they ask: the canvas is hosted by
this VibeSpace instance at that link; it is PRIVATE by default (viewers
log in to VibeSpace) unless published with \`--public\` or switched to
public from the chat status bar's design popover, where the user can
also copy the link or flip it back; viewers get the canvas read-only
with pan/zoom, Fit and PNG/PDF export — there is no in-canvas Save in
this preview, so changes are made by editing the working files and
republishing (same file path → same link); nothing is sent to
claude.ai. If a publish fails, relay \`vibespace-page\`'s error verbatim
and hand over the seeded \`.html\` by path (it opens in a browser as the
same read-only canvas).

`;

/** The VibeSpace adaptation of the extracted skill text. Returns
 *  { text } or { error } — NEVER a half-adapted document (review-caught:
 *  the first version left the artifact "how to talk to the user" facts,
 *  the "re-run /design" hint and the saving sentence in place, and the
 *  request says "follow it exactly"). */
function adaptSkill(orig) {
  const s4 = orig.search(STEP4_RE), s5 = orig.search(STEP5_RE);
  const u0 = orig.search(UPDATING_RE), u1 = orig.search(ARTBOARDS_RE);
  const bad = (what) => ({ error: `design skill layout changed (${what} not found) — the VibeSpace design adaptation needs an update for this CLI version` });
  if (s4 < 0 || s5 < 0 || s5 < s4) return bad('publish step');
  if (u0 < 0 || u1 < 0 || u1 < u0) return bad('updating section');
  let text = orig.slice(0, s4) + VS_STEP4 + orig.slice(s5, u0) + VS_UPDATING + orig.slice(u1);
  const t0 = text.search(TALK_RE), t1 = text.search(FOUNDATION_RE);
  if (t0 < 0 || t1 < 0 || t1 < t0) return bad('how-to-talk section');
  text = text.slice(0, t0) + VS_TALK + text.slice(t1);
  if (!SAVING_RE.test(text)) return bad('saving sentence');
  text = text.replace(SAVING_RE, VS_SAVING);
  if (!REEXTRACT_RE.test(text)) return bad('re-extract hint');
  text = text.replace(REEXTRACT_RE, VS_REEXTRACT);
  // banner right after the frontmatter
  const fm = text.indexOf('\n---\n');
  if (fm < 0) return bad('frontmatter');
  text = text.slice(0, fm + 5) + '\n' + VS_BANNER + text.slice(fm + 5);
  return { text };
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** A directory we will READ AND EXECUTE from must be ours: a real dir (no
 *  symlink), owned by this uid, not group/world-writable. /tmp is sticky
 *  and world-writable — the CLI makes its dir 0700, but nothing stops a
 *  pre-created impostor on a shared host (review-caught hardening). */
function ownedDir(p) {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink() || !st.isDirectory()) return false;
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
    if (st.mode & 0o022) return false;
    return true;
  } catch { return false; }
}

/** The CLI's own extraction dir for this uid, SAME CLI VERSION ONLY:
 *  /tmp/claude-<uid>/bundled-skills/<ver>/<hash>/design (an older version's
 *  helper+payload paired with a newer binary's skill text would be a skew
 *  the helper's own --check cannot detect — review-caught; the binary path
 *  is the fallback). */
function findCliExtractedKit(preferVersion) {
  const root = path.join(os.tmpdir(), `claude-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`, 'bundled-skills');
  if (!preferVersion || !ownedDir(root)) return null;
  const hits = [];
  try {
    const verDir = path.join(root, preferVersion);
    if (!ownedDir(verDir)) return null;
    for (const h of fs.readdirSync(verDir)) {
      const dir = path.join(verDir, h, 'design');
      if (!ownedDir(path.join(verDir, h)) || !ownedDir(dir)) continue;
      const helper = path.join(dir, 'seed-canvas.mjs'), payload = path.join(dir, 'payload.template.html');
      try {
        if (!fs.lstatSync(helper).isFile() || !fs.lstatSync(payload).isFile()) continue;
        hits.push({ dir, version: preferVersion, mtime: fs.statSync(payload).mtimeMs });
      } catch { }
    }
  } catch { }
  hits.sort((a, b) => b.mtime - a.mtime);
  return hits[0] || null;
}

function create({ dataDir, claudeCmd, log = () => { } }) {
  const root = path.join(dataDir, 'design-kit');
  let last = null;        // last ensure() result (status)
  let inflight = null;

  function resolveBinary() {
    let cmd = null;
    try { cmd = typeof claudeCmd === 'function' ? claudeCmd() : claudeCmd; } catch { }
    if (!cmd) return null;
    try { return fs.realpathSync(cmd); } catch { return null; }
  }
  function versionOf(bin) {
    const m = /[\\/]versions[\\/](\d+\.\d+\.\d+)(?:[\\/]|$)/.exec(bin) || /claude-code[\\/](\d+\.\d+\.\d+)[\\/]/.exec(bin);
    if (m) return m[1];
    return new Promise((resolve) => {
      execFile(bin, ['--version'], { timeout: 8000 }, (e, out) => {
        const v = /(\d+\.\d+\.\d+)/.exec(String(out || ''));
        if (v) return resolve(v[1]);
        try { const st = fs.statSync(bin); resolve('bin-' + sha(`${st.size}:${st.mtimeMs}`).slice(0, 12)); } catch { resolve('bin-unknown'); }
      });
    });
  }
  const run = (cmd, args, opts = {}) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024, ...opts }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(out || ''), err: String(err || '') }));
  });

  /** Seed a sample artboard with the kit's own helper and run its --check. */
  async function validateKit(dir) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-check-'));
    try {
      fs.writeFileSync(path.join(tmp, 'Main.dc.html'), '<!doctype html><html><head><script src="./support.js"></script></head><body style="width:320px;height:120px;background:#fff;font:20px sans-serif;padding:20px">Kit check</body></html>');
      const seed = await run(process.execPath, [path.join(dir, 'seed-canvas.mjs'), '--template', path.join(dir, 'payload.template.html'), '--out', 'kit-check-card.html', '--title', 'Kit Check Card', '--artboard', 'Main.dc.html'], { cwd: tmp });
      if (seed.code !== 0) return `helper seed failed: ${(seed.err || seed.out).trim().slice(0, 300)}`;
      const chk = await run(process.execPath, [path.join(dir, 'seed-canvas.mjs'), '--check', 'kit-check-card.html'], { cwd: tmp });
      if (chk.code !== 0 || !/^ok:/m.test(chk.out)) return `helper --check failed: ${(chk.err || chk.out).trim().slice(0, 300)}`;
      return null;
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
  }

  async function build(force) {
    const bin = resolveBinary();
    if (!bin) return { ok: false, error: 'claude CLI binary not found on this machine' };
    const version = await versionOf(bin);
    const dir = path.join(root, version);
    const kitFile = path.join(dir, 'kit.json');
    if (!force) {
      try {
        const k = JSON.parse(fs.readFileSync(kitFile, 'utf-8'));
        if (k.ok && ['seed-canvas.mjs', 'payload.template.html', 'SKILL.md', 'SKILL.orig.md'].every((f) => fs.existsSync(path.join(dir, f)))) return { ...k, dir, cached: true };
      } catch { }
    }
    fs.mkdirSync(dir, { recursive: true });
    const out = { ok: false, version, binary: bin, dir, source: null, files: {}, createdAt: Date.now() };
    try {
      // 1. helper + payload: the CLI's own extraction first, the binary second
      const cli = findCliExtractedKit(version);
      let helperBuf = null, payloadBuf = null;
      if (cli) {
        helperBuf = fs.readFileSync(path.join(cli.dir, 'seed-canvas.mjs'));
        payloadBuf = fs.readFileSync(path.join(cli.dir, 'payload.template.html'));
        out.source = `cli-extracted (${cli.dir})`;
      }
      const need = [SKILL_ANCHOR];
      if (!helperBuf) need.push(HELPER_ANCHOR);
      const offs = await findOffsets(bin, need);
      if (!offs.has(SKILL_ANCHOR)) throw new Error('design skill text not found in the CLI binary (layout changed?)');
      if (!helperBuf) {
        if (!offs.has(HELPER_ANCHOR)) throw new Error('design helper not found in the CLI binary and not extracted by the CLI yet — run /design once in a terminal-mode session, then retry');
        const helper = await readTemplateLiteral(bin, offs.get(HELPER_ANCHOR) + 1);
        payloadBuf = await extractPayload(bin);
        if (!helper || !payloadBuf || payloadBuf.length < 100000) throw new Error('design helper/payload extraction from the CLI binary came back incomplete');
        helperBuf = Buffer.from(helper, 'utf8');
        out.source = 'binary-extracted';
      }
      const skill = await readTemplateLiteral(bin, offs.get(SKILL_ANCHOR) + 1);
      if (!skill || !/^---\nname: design\n/.test(skill)) throw new Error('design skill text extraction from the CLI binary came back incomplete');
      const adapted = adaptSkill(skill);
      if (adapted.error) throw new Error(adapted.error);
      const writeAtomic = (f, buf) => { fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f); };
      writeAtomic(path.join(dir, 'seed-canvas.mjs'), helperBuf);
      writeAtomic(path.join(dir, 'payload.template.html'), payloadBuf);
      writeAtomic(path.join(dir, 'SKILL.orig.md'), Buffer.from(skill, 'utf8'));
      writeAtomic(path.join(dir, 'SKILL.md'), Buffer.from(adapted.text, 'utf8'));
      out.files = { 'seed-canvas.mjs': sha(helperBuf), 'payload.template.html': sha(payloadBuf), 'SKILL.md': sha(adapted.text), 'SKILL.orig.md': sha(skill) };
      // 2. prove it: the kit's own helper must seed + check a sample
      const bad = await validateKit(dir);
      if (bad) throw new Error(bad);
      out.ok = true;
    } catch (e) {
      out.error = e.message;
    }
    try { fs.writeFileSync(kitFile + '.tmp', JSON.stringify(out, null, 2)); fs.renameSync(kitFile + '.tmp', kitFile); } catch { }
    log(`[design-kit] ${out.ok ? 'ready' : 'NOT ready'}: CLI ${version} ${out.source || ''} ${out.error ? '— ' + out.error : ''}`);
    return out;
  }

  /** Ensure the kit for the installed CLI (cached per version). One build at a time. */
  function ensure({ force = false } = {}) {
    if (inflight) return inflight;
    inflight = build(force).then((r) => { last = r; return r; }).finally(() => { inflight = null; });
    return inflight;
  }
  const status = () => last || { ok: false, error: 'design kit not prepared yet', pending: !!inflight };
  const fileFor = (name) => {
    if (!last || !last.ok) return null;
    if (!['seed-canvas.mjs', 'payload.template.html', 'SKILL.md', 'SKILL.orig.md'].includes(name)) return null;
    return path.join(last.dir, name);
  };

  /** Cookie-authed status for the chat status bar; `?refresh=1` rebuilds. */
  function registerRoutes(app) {
    app.get('/api/design-kit/status', async (req, res) => {
      // a FAILED build is retried on view once a minute (a transient failure at
      // boot must not pin a red line forever — review-caught); refresh=1 forces
      const stale = last && !last.ok && Date.now() - (last.createdAt || 0) > 60000;
      const r = (req.query.refresh === '1' || !last || stale) ? await ensure({ force: req.query.refresh === '1' }) : status();
      res.json({ ok: !!r.ok, version: r.version || null, source: r.source || null, dir: r.dir || null, error: r.error || null, cached: !!r.cached });
    });
  }

  return { ensure, status, fileFor, registerRoutes, adaptSkill, unescapeTemplate, findCliExtractedKit, _internals: { findOffsets, findAll, readTemplateLiteral, readPayloadAsset, extractPayload, HELPER_ANCHOR } };
}

module.exports = { create, adaptSkill, unescapeTemplate, ownedDir };
