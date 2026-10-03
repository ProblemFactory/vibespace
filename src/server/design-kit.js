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
//
// CLAUDE CODE 2.1.287 SHIPS NO KIT (lane design-kit-287, MEASURED 2026-10-02
// by reading the binaries as bytes): its /design router lost the `canvas`
// mode — 2.1.281's `wn()` answers types → canvas → hub → consent, 2.1.287's
// answers types → hub → consent (both remaining modes work through claude.ai:
// an Artifact of the published "Design" type, or the claude.ai/design hub
// whose instructions come live from an MCP tool) — and the canvas module
// went with it: loadDesignCanvasFiles / isDesignCanvasSkillEnabled 0 (3 in
// 2.1.280 and 2.1.281), no SKILL / seed-canvas / payload entries in the bunfs
// table, 0 of the three zstd frames (166 frames decoded in both). Nothing
// fetches it at run time (no loader is left to call). So the kit now falls
// back to ANOTHER VERSION on this machine — an installed older CLI binary
// first, a kit this server stored earlier second (the CLI's updater keeps
// three versions: 2.1.274 was purged at 03:38 that same morning) — with the
// skew SAID in the record and on the popover, and every refusal naming the
// version and the rung that refused (`donorOrder` is the PURE pick).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { agentEnv } = require('../agent-env.js');

const SKILL_ANCHOR = Buffer.from('`---\nname: design\ndescription: "Create a design canvas');
const HELPER_ANCHOR = Buffer.from('`// Design-canvas seeding helper.');
const PAYLOAD_ASSET = Buffer.from('payload.template.html.asset');
const PAYLOAD_START = Buffer.from('<!doctype html', 'utf8');
// The canvas module's export name: present (×3) in every kit-carrying build
// measured (2.1.280, 2.1.281), absent from 2.1.287. Read only to WORD a
// refusal ("does not ship" vs "layout changed") — never to skip a scan.
const CANVAS_MARKER = Buffer.from('loadDesignCanvasFiles');
// The last Claude Code version MEASURED to ship the kit (2026-10-02). A
// refusal names it (or a newer donor this server has seen, whichever is newer).
const LAST_SHIPPED = '2.1.281';
// Stored kits are BOUNDED (verify r1): one dir per CLI version this server ever
// ran, ~2.5 MB each, ten on production after six weeks — after a successful
// build the newest STORED_KEEP dirs by name stay, the rest go (never the one
// just built). A dir named V holds a kit of version ≤ V, so the newest names
// hold the newest kits.
const STORED_KEEP = 8;
// Where `npm install -g @anthropic-ai/claude-code` lands — the fleet image bakes
// one under /usr/local (verify r1): package.json names the version (no spawn),
// cli.js is the file read as bytes. A real binary of another version on the
// machine, so the donor rule admits it; the read is the evidence.
const NPM_PACKAGE_ROOTS = () => [...new Set(['/usr/local', '/usr', '/opt/homebrew', path.join(os.homedir(), '.npm-global'), process.env.NPM_CONFIG_PREFIX || ''].filter(Boolean))]
  .map((p) => path.join(p, 'lib', 'node_modules', '@anthropic-ai', 'claude-code'));
const CHUNK = 8 * 1024 * 1024;
const MAX_LITERAL = 512 * 1024;     // helper ≈ 37 KB, skill ≈ 57 KB
const MAX_PAYLOAD = 16 * 1024 * 1024;
// A binary over this is not read (verify r2): the zstd rung reads the whole file
// (every Claude Code build measured is 230–245 MB; Node's own cliff is 2 GiB, and a
// 1.5 GiB cli.js under a planted package.json was read whole in one allocation).
const MAX_BINARY = 1024 * 1024 * 1024;

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

/** CLI ≥2.1.257 packs the skill pieces as ZSTD FRAMES inside the bun binary
 *  (/$bunfs/root/SKILL-<hash>.md.zst, seed-canvas.mjs-<hash>.txt.zst, and the
 *  payload — verified 2026-09-04 by a full-frame scan: skill 56KB with its
 *  frontmatter intact, helper 40KB, payload 2.4MB ending </html>). The old
 *  template-literal anchors are gone from those builds. Every zstd magic in
 *  the file is a candidate; non-frames fail to decode in microseconds. One
 *  scan per CLI version (the kit dir caches the result). Needs Node's zstd
 *  (≥22.15) — an older Node says so instead of pretending. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/** The whole binary in memory for the zstd rung, BOUNDED ON THE FD IT READS
 *  (verify r3): the stat in extractPieces is a pre-check BY PATH — a file that
 *  grew past the bound between that stat and the read was read whole (1 GiB + 1
 *  measured, RSS 1078 MB; Node's 2 GiB cliff the only wall). The size the read
 *  is cut to comes from fstat on the open fd; a file that grows after that is
 *  read only to that size (a tail that landed later is not seen — a refusal
 *  the next build re-reads), one that shrank is returned as read. Async: a
 *  240 MB read never sits on the event loop. */
async function readBounded(file, max = MAX_BINARY) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    if (size > max) { const e = new Error(`the file is ${(size / 2 ** 30).toFixed(1)} GiB — larger than any Claude Code build (the ${max / 2 ** 30} GiB bound); not read`); e.code = 'EFBIG'; throw e; }
    const buf = Buffer.allocUnsafe(size);
    let off = 0;
    while (off < size) { const { bytesRead } = await fh.read(buf, off, size - off, off); if (!bytesRead) break; off += bytesRead; }
    return off === size ? buf : buf.subarray(0, off);
  } finally { await fh.close(); }
}
async function extractFromZstd(file) {
  const zlib = require('zlib');
  if (typeof zlib.zstdDecompressSync !== 'function') throw new Error('this CLI packs the design skill as zstd frames — Node ≥22.15 (zlib zstd) is required to extract it');
  const d = await readBounded(file);
  const found = { skill: null, helper: null, payload: null };
  let i = 0;
  while ((i = d.indexOf(ZSTD_MAGIC, i)) >= 0) {
    if (!(found.skill && found.helper && found.payload)) {
      try {
        const out = zlib.zstdDecompressSync(d.subarray(i, Math.min(d.length, i + 24 * 1024 * 1024)), { maxOutputLength: 24 * 1024 * 1024 });
        if (out.length > 200) {
          const head = out.subarray(0, 120).toString('utf8');
          if (!found.skill && /^---\nname: design\n/.test(head)) found.skill = out.toString('utf8');
          else if (!found.helper && /^\/\/ Design-canvas seeding helper/.test(head)) found.helper = out;
          else if (!found.payload && out.length > 500000 && /^<!doctype html/i.test(head) && out.includes('id="appifact-doc"')) found.payload = out;
        }
      } catch { }
    } else break;
    i += 4;
  }
  return found;
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

/** A STORED kit dir we will READ AND EXECUTE from (verify r1, the planted-kit
 *  finding: a dir under data/design-kit/ with a self-written kit.json and a
 *  foreign helper was taken as a donor and its helper RUN by the --check). Who
 *  wrote a kit.json is provable only to the uid: so the dir must be a real dir
 *  (no symlink) of OUR uid; world-writable is REFUSED (our umask never makes
 *  o+w — it is a deliberate loosening, and anything inside may be anyone's);
 *  group-writable we own is what umask 002 produced (every kit before this
 *  rule) ⇒ TIGHTENED to 0700 and accepted. PURE over a stat-like record. */
function judgeStoredDir(st, uid) {
  if (!st) return { why: 'its dir is missing' };
  if (st.isSymbolicLink()) return { why: 'its dir is a symlink' };
  if (!st.isDirectory()) return { why: 'it is not a directory' };
  if (uid != null && st.uid !== uid) return { why: 'its dir belongs to another uid' };
  if (st.mode & 0o002) return { why: 'its dir is world-writable (chmod 700 it, or remove it)' };
  return { ok: true, tighten: !!(st.mode & 0o077) };
}
function storedDirVerdict(dir) {
  let st = null;
  try { st = fs.lstatSync(dir); } catch { }
  const v = judgeStoredDir(st, typeof process.getuid === 'function' ? process.getuid() : null);
  if (v.ok && v.tighten) { try { fs.chmodSync(dir, 0o700); } catch (e) { return { why: `its dir could not be tightened to 0700 (${e.code || e.message})` }; } }
  return v;
}
/** THE BYTES WE HASH, HAND OUT OR EXECUTE ARE READ FROM A FILE THAT IS OURS
 *  (verify r2, the TOCTOU + symlink-entry findings): the dir's lstat said "a real
 *  dir of our uid" an instant ago, but every read after it was BY PATH — a
 *  symlink entry inside an owned 0700 kit dir was followed to a foreign helper
 *  whose bytes matched the sha beside it, and a dir swapped between the judge and
 *  the read would be read all the same. So the file is opened O_NOFOLLOW (a
 *  symlink entry is ELOOP, never followed) and judged on ITS OWN fd (fstat): a
 *  regular file of our uid, not world-writable; group-writable (umask 002 — every
 *  kit file before this rule) is tightened to 0600 on the fd we hold. Whatever a
 *  path did in between, the bytes returned are from a file only our uid could
 *  have written. Throws with `kitWhy` (the named refusal) on anything else.
 *  A HARD LINK is not refused (verify r3 ①): the inode is what fstat judges, and
 *  every name shares its uid and mode (the fchmod reaches them all) — linking
 *  into a 0700 dir of ours takes our uid (fs.protected_hardlinks=1 besides), so
 *  nlink > 1 is the same-uid boundary, not a crossing of it. What a second name
 *  COULD do — rewrite the bytes after the hash — is closed where it mattered:
 *  the --check runs the hashed BUFFERS from its own scratch (validateKit) and the
 *  hand-out re-hashes against the record (readKitFile). */
function readOwnFile(p) {
  const named = (why) => { const e = new Error(`${path.basename(p)} ${why}`); e.kitWhy = e.message; return e; };
  let fd;
  try { fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)); } catch (e) { if (e.code === 'ELOOP') throw named('is a symlink'); throw e; }
  try {
    const st = fs.fstatSync(fd);
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (!st.isFile()) throw named('is not a regular file');
    if (uid != null && st.uid !== uid) throw named('belongs to another uid');
    if (st.mode & 0o002) throw named('is world-writable');
    if (st.mode & 0o020) { try { fs.fchmodSync(fd, 0o600); } catch { } }
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
/** The kit root is OURS, or nothing is written under it (verify r2: a root that
 *  was a symlink was written INTO and the helper executed from its target):
 *  created 0700 when missing; a symlink, a non-dir or another uid's dir ⇒ a
 *  named refusal; a loose mode we own is tightened (a foreign entry under a
 *  once-loose root is still caught by its uid).
 *  THE BOUNDARY, STATED (verify r3 ④): the root is judged by path and the
 *  version dir is then mkdir'd by path — between the two the root can be swapped
 *  for a symlink and the build writes into and executes from the swapper's tree
 *  (reproduced with a same-uid swap). The swap needs write permission on the
 *  root's PARENT, the server's own data dir, which only our uid writes (this
 *  instance: drwxrwxr-x of the user's own group); Node has no openat/mkdirat to
 *  anchor the mkdir on the judged fd, so the window is the same-uid boundary
 *  every other door states — a planter of our uid is us. */
function ownStoredRoot(root) {
  try { fs.mkdirSync(root, { recursive: true, mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') return { why: `the kit root ${root} could not be created (${e.code || e.message})` }; }
  let st = null;
  try { st = fs.lstatSync(root); } catch (e) { return { why: `the kit root ${root} could not be read (${e.code || e.message})` }; }
  if (st.isSymbolicLink()) return { why: `the kit root ${root} is a symlink — not ours to write into (remove it)` };
  if (!st.isDirectory()) return { why: `the kit root ${root} is not a directory` };
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return { why: `the kit root ${root} belongs to another uid — not ours to write into` };
  if (st.mode & 0o077) { try { fs.chmodSync(root, 0o700); } catch (e) { return { why: `the kit root ${root} could not be tightened to 0700 (${e.code || e.message})` }; } }
  return { ok: true };
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

/** "2.1.287" → [2, 1, 287]; anything else (a hash id) → null. */
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v == null ? '' : v));
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** Numeric per part (2.1.100 > 2.1.99); an unparseable version sorts below every parseable one. */
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** THE DONOR PICK (PURE, lane design-kit-287). When the RUNNING CLI cannot give
 *  its own kit (2.1.287 ships none), the kit comes from another version on this
 *  machine. `installed` = [{version, path}] (binaries in the versions dirs),
 *  `stored` = [{version: <the kit's donor>, dir}] (data/design-kit/<v>/ whose
 *  kit.json is ok). The rule:
 *   - a donor is OLDER than the running CLI, never newer: an installed binary
 *     newer than the one running is an update still landing or a version the
 *     user stepped back from — the kit is the last one the CLI line the user
 *     RUNS carried. A running version that is not x.y.z (a hash id) lets every
 *     x.y.z candidate in; a candidate that is not x.y.z is never a donor;
 *   - newest first (the nearest older version);
 *   - at one version the installed binary before a stored copy (the CLI's own
 *     bytes first; the copy is for after the updater purged the binary);
 *   - one stored copy per donor version (the dir named by that version first).
 *  The order is the decision; each candidate is then READ in this order and
 *  the first that yields all three pieces wins (the read is the evidence). */
function donorOrder({ running, installed = [], stored = [] } = {}) {
  const runningParsed = parseVersion(running);
  const older = (v) => !!parseVersion(v) && (!runningParsed || compareVersions(v, running) < 0);
  const rows = [];
  const seenBin = new Set();
  for (const c of installed) {
    if (!c || !older(c.version) || seenBin.has(c.version)) continue;
    seenBin.add(c.version);
    rows.push({ rung: 'installed-version', version: c.version, path: c.path, kind: c.kind || 'binary' });
  }
  const seenKit = new Set();
  const named = stored.filter(Boolean).slice().sort((a, b) => (path.basename(b.dir || '') === b.version) - (path.basename(a.dir || '') === a.version));
  for (const c of named) {
    if (!older(c.version) || seenKit.has(c.version)) continue;
    seenKit.add(c.version);
    rows.push({ rung: 'stored-kit', version: c.version, dir: c.dir, files: c.files });
  }
  return rows.sort((a, b) => compareVersions(b.version, a.version) || (a.rung === b.rung ? 0 : a.rung === 'installed-version' ? -1 : 1));
}

/** THE ROWS donorOrder DROPPED, each with its reason (PURE; verify r1: a refusal
 *  that said "no other version on this machine" while a NEWER one sat installed
 *  hid a fact). The running version itself is not a row (its own rung spoke). */
function skippedDonors({ running, installed = [], stored = [] } = {}) {
  const runningParsed = parseVersion(running);
  const rows = [];
  const why = (v) => !parseVersion(v) ? 'not a version'
    : (runningParsed && compareVersions(v, running) === 0) ? null
      : (runningParsed && compareVersions(v, running) > 0) ? `newer than the running CLI ${running} — VibeSpace reads the kit only from an OLDER version, so this one is left alone` : null;
  for (const c of installed) { const w = c && why(c.version); if (w) rows.push({ rung: 'installed-version', version: c.version, kind: c.kind || 'binary', why: w }); }
  for (const c of stored) { const w = c && why(c.version); if (w) rows.push({ rung: 'stored-kit', version: c.version, dir: c.dir, why: w }); }
  return rows;
}

/** Binaries named x.y.z in the given versions dirs (the native installer's
 *  ~/.local/share/claude/versions/<ver> family); first dir wins per version.
 *  Then npm packages (`packageDirs` = <prefix>/lib/node_modules/@anthropic-ai/
 *  claude-code): package.json's version, cli.js the binary — kind 'npm'. */
function listInstalledVersions(dirs, packageDirs = []) {
  const out = [], seen = new Set();
  for (const d of dirs || []) {
    let names = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      if (!parseVersion(n) || seen.has(n)) continue;
      const p = path.join(d, n);
      try { if (fs.statSync(p).isFile()) { seen.add(n); out.push({ version: n, path: p, kind: 'binary' }); } } catch { }
    }
  }
  for (const d of packageDirs || []) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
      const v = pkg && pkg.version;
      if (!pkg || pkg.name !== '@anthropic-ai/claude-code' || !parseVersion(v) || seen.has(v)) continue;
      const p = path.join(d, 'cli.js');
      if (fs.statSync(p).isFile()) { seen.add(v); out.push({ version: v, path: p, kind: 'npm' }); }
    } catch { }
  }
  return out;
}

/** Kits this server built earlier (data/design-kit/<v>/kit.json ok), each named
 *  by the CLI version its pieces came from (`donorVersion`, else its own). */
function listStoredKits(root, refused = null) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(root); } catch { return out; }
  for (const n of names) {
    const dir = path.join(root, n);
    const v = storedDirVerdict(dir);
    if (!v.ok) { if (refused && parseVersion(n)) refused.push({ version: n, dir, why: v.why }); continue; }
    let k = null;
    try { k = JSON.parse(readOwnFile(path.join(dir, 'kit.json')).toString('utf8')); } catch { continue; }
    if (!k || k.ok !== true || !k.files) continue;
    const donor = k.donorVersion || k.version;
    if (!parseVersion(donor)) continue;
    out.push({ version: donor, dir, files: k.files });
  }
  return out;
}

/** After a successful build: keep the newest `keep` x.y.z-named KIT dirs (by
 *  name; a dir whose kit.json is not `ok` is a failed record of a version no
 *  longer running — verify r2: eight of those, 16 bytes each, filled the bound
 *  while the real kits were the ones removed — so it is removed first and never
 *  counts), never `current`, never `spare` (the dir this build just READ its
 *  donor from — a kit read seconds ago is not deleted by the build that read it;
 *  the next successful build, whose donor is another copy, removes it); a symlink
 *  or a dir that is not ours is never touched (rmSync unlinks a symlink INSIDE a
 *  removed dir, never its target — measured). */
function pruneStoredKits(root, { keep = STORED_KEEP, current = null, spare = null } = {}) {
  let names = [];
  try { names = fs.readdirSync(root).filter((n) => parseVersion(n)); } catch { return []; }
  names.sort((a, b) => compareVersions(b, a));
  const same = (dir, p) => !!p && path.resolve(dir) === path.resolve(p);
  const removed = [];
  const kitOk = (dir) => { try { return JSON.parse(readOwnFile(path.join(dir, 'kit.json')).toString('utf8')).ok === true; } catch { return false; } };
  const kits = [], failed = [];
  for (const n of names) {
    const dir = path.join(root, n);
    if (same(dir, current) || same(dir, spare)) { kits.push(n); continue; }
    (kitOk(dir) ? kits : failed).push(n);
  }
  for (const n of failed.concat(kits.slice(keep))) {
    const dir = path.join(root, n);
    if (same(dir, current) || same(dir, spare)) continue;
    const v = judgeStoredDir((() => { try { return fs.lstatSync(dir); } catch { return null; } })(), typeof process.getuid === 'function' ? process.getuid() : null);
    if (!v.ok) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); removed.push(n); } catch { }
  }
  return removed;
}

const RUNG_WORDS = {
  'cli-extracted': "the CLI's own extraction dir",
  'binary-read': 'reading the binary',
  'binary-template': "the binary's template-literal layout",
  'binary-zstd': "the binary's zstd frames",
  'installed-version': 'an installed CLI version',
  'stored-kit': 'a kit this server stored earlier',
  adaptation: 'the VibeSpace adaptation',
  check: "the kit's own helper --check",
  'kit-dir': 'the kit directory',
  build: 'the build',
};
const refusalLine = (version, rung, why) => `CLI ${version} — ${RUNG_WORDS[rung] || rung}: ${why}`;

function create({ dataDir, claudeCmd, versionsDirs = null, packageDirs = null, log = () => { } }) {
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
    // the ONE exec of the CLI path, with the sanitized env every agent child gets
    // (verify r2: it inherited the server's full process.env — VIBESPACE_PASSWORD,
    // the cluster secrets, an ambient CLAUDE_CODE_OAUTH_TOKEN); the gate's recorder
    // leg pins that nothing but `--version` is ever asked of it
    return new Promise((resolve) => {
      execFile(bin, ['--version'], { timeout: 8000, env: agentEnv(process.env) }, (e, out) => {
        const v = /(\d+\.\d+\.\d+)/.exec(String(out || ''));
        if (v) return resolve(v[1]);
        try { const st = fs.statSync(bin); resolve('bin-' + sha(`${st.size}:${st.mtimeMs}`).slice(0, 12)); } catch { resolve('bin-unknown'); }
      });
    });
  }
  const run = (cmd, args, opts = {}) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024, ...opts }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(out || ''), err: String(err || '') }));
  });

  /** Seed a sample artboard with the kit's own helper and run its --check. The
   *  helper is THIRD-PARTY CODE (Anthropic's, or whatever a same-uid planter put
   *  there): it runs with a MINIMAL env — never the server's process.env (verify
   *  r2: it saw VIBESPACE_PASSWORD, the Clerk / Lark secrets, CLAUDE_CODE_OAUTH_TOKEN,
   *  AWS keys); HOME, TMPDIR and cwd are the scratch dir (the real helper reads no
   *  env at all — measured); stdout bounded (4 MiB) and walled (30 s) by `run`. */
  const helperEnv = (tmp) => Object.fromEntries(Object.entries({ PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: tmp, TMPDIR: tmp, LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL, TZ: process.env.TZ }).filter(([, v]) => v != null));
  /** THE EXECUTED BYTES ARE THE HASHED BYTES (verify r3 ②): the helper and the
   *  template are written into this 0700 scratch FROM THE BUFFERS the record's
   *  sha256 names, and run from here — never from the kit dir by path (a same-uid
   *  writer swapping the kit dir's helper between its write and the --check had
   *  its helper executed while the record said the original; reproduced). Every
   *  argv path is under the scratch, the output names are relative to it (cwd);
   *  the agent's later runs are the agent's own process, env and argv. */
  async function validateKit({ helperBuf, payloadBuf }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-check-'));
    try {
      const helper = path.join(tmp, 'seed-canvas.mjs'), template = path.join(tmp, 'payload.template.html');
      fs.writeFileSync(helper, helperBuf, { mode: 0o600 });
      fs.writeFileSync(template, payloadBuf, { mode: 0o600 });
      fs.writeFileSync(path.join(tmp, 'Main.dc.html'), '<!doctype html><html><head><script src="./support.js"></script></head><body style="width:320px;height:120px;background:#fff;font:20px sans-serif;padding:20px">Kit check</body></html>');
      const seed = await run(process.execPath, [helper, '--template', template, '--out', 'kit-check-card.html', '--title', 'Kit Check Card', '--artboard', 'Main.dc.html'], { cwd: tmp, env: helperEnv(tmp) });
      if (seed.code !== 0) return `helper seed failed: ${(seed.err || seed.out).trim().slice(0, 300)}`;
      const chk = await run(process.execPath, [helper, '--check', 'kit-check-card.html'], { cwd: tmp, env: helperEnv(tmp) });
      if (chk.code !== 0 || !/^ok:/m.test(chk.out)) return `helper --check failed: ${(chk.err || chk.out).trim().slice(0, 300)}`;
      return null;
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
  }

  /** The three pieces from ONE binary, or a refusal naming the rung:
   *  {ok:true, skill, helperBuf, payloadBuf, rung, layout, source} |
   *  {ok:false, rung, why, shipped}. `shipped:false` = the binary carries no
   *  canvas code at all (2.1.287); null = it does or we cannot tell.
   *  `cliExtracted` only for the RUNNING version (the CLI's /tmp dir is
   *  per version and pairs with that binary's skill text — review-caught). */
  async function extractPieces(bin, version, { cliExtracted = true } = {}) {
    let rung = 'cli-extracted';
    const refuse = (why, shipped = null) => ({ ok: false, rung, why, shipped });
    try {
      const cli = cliExtracted ? findCliExtractedKit(version) : null;
      let helperBuf = null, payloadBuf = null, source = null;
      if (cli) {
        helperBuf = readOwnFile(path.join(cli.dir, 'seed-canvas.mjs'));
        payloadBuf = readOwnFile(path.join(cli.dir, 'payload.template.html'));
        source = `cli-extracted (${cli.dir})`;
      }
      rung = 'binary-read'; // a failure from here on is the binary's (unreadable, vanished mid-scan), not the extraction dir's
      const size = fs.statSync(bin).size;
      if (size > MAX_BINARY) return refuse(`the file is ${(size / 2 ** 30).toFixed(1)} GiB — larger than any Claude Code build (the ${MAX_BINARY / 2 ** 30} GiB bound); not read`);
      const need = [SKILL_ANCHOR];
      if (!helperBuf) need.push(HELPER_ANCHOR);
      const offs = await findOffsets(bin, need);
      let skill = null, layout;
      if (offs.has(SKILL_ANCHOR)) {
        // ≤2.1.25x layout: template literals + raw payload asset
        rung = 'binary-template'; layout = 'template literal';
        if (!helperBuf) {
          if (!offs.has(HELPER_ANCHOR)) return refuse('design helper not found in the CLI binary and not extracted by the CLI yet — run /design once in a terminal-mode session, then retry');
          const helper = await readTemplateLiteral(bin, offs.get(HELPER_ANCHOR) + 1);
          payloadBuf = await extractPayload(bin);
          if (!helper || !payloadBuf || payloadBuf.length < 100000) return refuse('design helper/payload extraction from the CLI binary came back incomplete');
          helperBuf = Buffer.from(helper, 'utf8');
          source = 'binary-extracted';
        }
        skill = await readTemplateLiteral(bin, offs.get(SKILL_ANCHOR) + 1);
      } else {
        // ≥2.1.257 layout: zstd frames (skill + helper + payload)
        rung = 'binary-zstd'; layout = 'zstd';
        const z = await extractFromZstd(bin);
        if (!z.skill) {
          const canvasCode = (await findOffsets(bin, [CANVAS_MARKER])).has(CANVAS_MARKER);
          return canvasCode
            ? refuse('the design canvas code is in this CLI but its skill text is in neither the template-literal nor the zstd layout — the binary layout changed')
            : refuse('this CLI does not ship the design canvas kit (no canvas code, no skill / helper / payload frames — its /design works through claude.ai)', false);
        }
        skill = z.skill;
        if (!helperBuf) {
          if (!z.helper || !z.payload) return refuse('design helper/payload zstd frames not found in the CLI binary — run /design once in a terminal-mode session (the CLI extracts them), then retry');
          helperBuf = z.helper; payloadBuf = z.payload;
          source = 'binary-extracted (zstd)';
        }
      }
      if (!skill || !/^---\nname: design\n/.test(skill)) return refuse('design skill text extraction from the CLI binary came back incomplete');
      return { ok: true, skill, helperBuf, payloadBuf, rung: cli ? 'cli-extracted' : rung, layout, source };
    } catch (e) { return refuse(e.message); }
  }

  /** A kit this server stored earlier: its three verbatim pieces, each checked
   *  against the sha its kit.json recorded (a copy that changed is no kit). */
  function readStoredKit(c) {
    try {
      // each piece from a file that is OURS (readOwnFile: O_NOFOLLOW + fstat — a
      // symlink entry or a foreign file is refused by name, never followed)
      const helperBuf = readOwnFile(path.join(c.dir, 'seed-canvas.mjs'));
      const payloadBuf = readOwnFile(path.join(c.dir, 'payload.template.html'));
      const skillBuf = readOwnFile(path.join(c.dir, 'SKILL.orig.md'));
      const f = c.files || {};
      if (sha(helperBuf) !== f['seed-canvas.mjs'] || sha(payloadBuf) !== f['payload.template.html'] || sha(skillBuf) !== f['SKILL.orig.md']) return { ok: false, rung: 'stored-kit', why: 'its files no longer match the sha256 its kit.json recorded' };
      const skill = skillBuf.toString('utf8');
      if (!/^---\nname: design\n/.test(skill)) return { ok: false, rung: 'stored-kit', why: 'its SKILL.orig.md is not the design skill' };
      return { ok: true, skill, helperBuf, payloadBuf, rung: 'stored-kit', layout: 'stored', source: null };
    } catch (e) { return { ok: false, rung: 'stored-kit', why: e.kitWhy || (e.code === 'ENOENT' ? 'a file of it is missing' : e.message) }; }
  }

  const packageDirsFor = () => Array.isArray(packageDirs) ? packageDirs : NPM_PACKAGE_ROOTS();
  function versionsDirsFor(bin) {
    if (Array.isArray(versionsDirs)) return versionsDirs;
    const dirs = [];
    const m = /^(.*[\\/]versions)[\\/]\d+\.\d+\.\d+$/.exec(bin || '');
    if (m) dirs.push(m[1]);
    dirs.push(path.join(os.homedir(), '.local', 'share', 'claude', 'versions'));
    return [...new Set(dirs)];
  }

  async function build(force) {
    const bin = resolveBinary();
    if (!bin) return { ok: false, error: 'claude CLI binary not found on this machine', rung: 'resolve' };
    const version = await versionOf(bin);
    const dir = path.join(root, version);
    const kitFile = path.join(dir, 'kit.json');
    const refused = (rung, why, code = 'refused_dir') => ({ ok: false, version, binary: bin, dir, source: null, rung, code, error: refusalLine(version, rung, why), createdAt: Date.now() });
    // THE RUNNING VERSION'S OWN DIR IS JUDGED LIKE EVERY STORED DIR (verify r2: a
    // dir planted at data/design-kit/<running>/ — a symlink to a foreign tree, or
    // world-writable — passed the cache hit with its self-written kit.json, and
    // `fileFor` handed its helper to the agent; r1's door judged only the DONOR
    // candidates). A refused dir is never read, never written into: the record
    // is kept in memory (the status route shows it), nothing lands on disk.
    const dv = storedDirVerdict(dir);
    if (!dv.ok && dv.why !== 'its dir is missing') { const r = refused('kit-dir', `${dir} — ${dv.why}; remove it (VibeSpace never reads or writes it as it is)`); log(`[design-kit] NOT ready: CLI ${version} — ${r.error}`); return r; }
    if (!force && dv.ok) {
      try {
        const k = JSON.parse(readOwnFile(kitFile).toString('utf-8'));
        // the cached kit is served only if its files are STILL the bytes its kit.json
        // recorded (verify r1: a helper swapped under a cached kit was handed out),
        // each read from a file that is OURS (readOwnFile — verify r2)
        const names = ['seed-canvas.mjs', 'payload.template.html', 'SKILL.md', 'SKILL.orig.md'];
        if (k.ok && k.files && names.every((f) => sha(readOwnFile(path.join(dir, f))) === k.files[f])) return { ...k, dir, cached: true };
        if (k.ok) log(`[design-kit] the stored kit for CLI ${version} no longer matches the sha256 its kit.json recorded — rebuilding`);
      } catch { }
    }
    // the kit root is ours (0700; a loose one tightened; a symlink or another
    // uid's dir refused by name — never written into), then the donor candidates
    // are listed BEFORE this build touches its own dir (a refresh of a kit that
    // came from a donor lists that kit as a stored copy)
    const rv = ownStoredRoot(root);
    if (!rv.ok) { const r = refused('kit-dir', rv.why); log(`[design-kit] NOT ready: CLI ${version} — ${r.error}`); return r; }
    const refusedStored = [];
    const stored = listStoredKits(root, refusedStored);
    const out = { ok: false, version, binary: bin, dir, source: null, rung: null, donorVersion: null, own: null, files: {}, createdAt: Date.now() };
    try {
      // the build's own dir: 0700, or a named refusal (verify r2: an unwritable
      // root threw EACCES out of build — ensure() rejected, the status route hung)
      try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700); } catch (e) { throw new Error(refusalLine(version, 'kit-dir', `${dir} could not be created (${e.code || e.message})`)); }
      // 1. the pieces: this CLI's own (its extraction dir, then its binary) …
      const own = await extractPieces(bin, version, { cliExtracted: true });
      let got = null;
      if (own.ok) { got = own; out.rung = own.rung; out.source = own.source; }
      else {
        // … else ANOTHER VERSION on this machine (donorOrder), the skew SAID
        out.own = { rung: own.rung, why: own.why, shipped: own.shipped };
        const dirs = versionsDirsFor(bin), pkgDirs = packageDirsFor();
        const installed = listInstalledVersions(dirs, pkgDirs);
        const order = donorOrder({ running: version, installed, stored });
        const skipped = skippedDonors({ running: version, installed, stored });
        const tried = [];
        const nameInstalled = (c) => `${c.version} installed${c.kind === 'npm' ? ` (npm package ${path.dirname(c.path)})` : ''}`;
        for (const c of order) {
          const r = c.rung === 'stored-kit' ? readStoredKit(c) : await extractPieces(c.path, c.version, { cliExtracted: false });
          if (r.ok) {
            got = r; out.rung = c.rung; out.donorVersion = c.version; out.donorFrom = c.path || c.dir; out.donorKind = c.kind || null; out.tried = tried.slice();
            const ownSays = own.shipped === false ? 'carries no design kit' : `could not give its own (${RUNG_WORDS[own.rung] || own.rung}: ${own.why})`;
            out.source = c.rung === 'stored-kit'
              ? `stored kit (${c.dir}, from CLI ${c.version} — this CLI ${version} ${ownSays})`
              : `binary-extracted (${r.layout}, from CLI ${c.version} — this CLI ${version} ${ownSays})`;
            break;
          }
          tried.push(`${c.rung === 'stored-kit' ? `${c.version} stored kit` : nameInstalled(c)} — ${RUNG_WORDS[r.rung] || r.rung}: ${r.why}`);
        }
        if (!got) {
          const last = stored.map((k) => k.version).concat(LAST_SHIPPED).sort(compareVersions).pop();
          out.lastShipped = last;
          out.code = own.shipped === false ? 'not_shipped' : 'unreadable';
          out.tried = tried.slice();
          // every candidate the ladder saw is NAMED: read and refused, refused at
          // the door (a stored dir not ours), or skipped by the rule (newer)
          const parts = [];
          if (tried.length) parts.push(`looked at: ${tried.join('; ')}`);
          if (refusedStored.length) parts.push(`refused at the door: ${refusedStored.map((r) => `${r.version} stored kit — ${r.why}`).join('; ')}`);
          if (skipped.length) parts.push(`skipped: ${skipped.map((r) => `${r.version} ${r.rung === 'stored-kit' ? 'stored kit' : r.kind === 'npm' ? 'installed (npm package)' : 'installed'} — ${r.why}`).join('; ')}`);
          const looked = parts.length ? parts.join('. ') : `no other version under ${dirs.join(', ')} and no stored kit${pkgDirs.length ? ` (npm packages looked for under ${pkgDirs.map((d) => path.dirname(d)).join(', ')})` : ''}`;
          // the ways out say what VibeSpace does BY ITSELF and what the user MAY do —
          // never advice to downgrade (verify r2: "install a version that ships it"
          // read as "step back to 2.1.281"; the official installer would replace the
          // CLI the user runs — VibeSpace only needs the file, and keeps looking)
          throw new Error(`${refusalLine(version, own.rung, own.why)}. No other version on this machine has a design kit either (${looked}). The last Claude Code version known to ship it: ${last}. VibeSpace keeps looking by itself — press Retry any time, and it re-checks whenever the design popover opens (at most once a minute): a Claude Code binary of ${last} or older that appears under ${dirs.join(', ')} or as the npm package is picked up without a restart; the CLI you run stays as it is, nothing is downgraded. Or use /design in a terminal session (it works through claude.ai).`);
        }
      }
      const kitVersion = out.donorVersion || version;
      const { skill, helperBuf, payloadBuf } = got;
      const adapted = adaptSkill(skill);
      if (adapted.error) throw new Error(refusalLine(kitVersion, 'adaptation', adapted.error));
      const writeAtomic = (f, buf) => { fs.writeFileSync(f + '.tmp', buf, { mode: 0o600 }); fs.renameSync(f + '.tmp', f); };
      writeAtomic(path.join(dir, 'seed-canvas.mjs'), helperBuf);
      writeAtomic(path.join(dir, 'payload.template.html'), payloadBuf);
      writeAtomic(path.join(dir, 'SKILL.orig.md'), Buffer.from(skill, 'utf8'));
      writeAtomic(path.join(dir, 'SKILL.md'), Buffer.from(adapted.text, 'utf8'));
      out.files = { 'seed-canvas.mjs': sha(helperBuf), 'payload.template.html': sha(payloadBuf), 'SKILL.md': sha(adapted.text), 'SKILL.orig.md': sha(skill) };
      // 2. prove it: the kit's own helper must seed + check a sample — the very
      // buffers hashed above, run from the check's own scratch (verify r3)
      const bad = await validateKit({ helperBuf, payloadBuf });
      if (bad) throw new Error(refusalLine(kitVersion, 'check', bad));
      out.ok = true;
      // bounded: the newest STORED_KEEP kit dirs stay (this one always; the dir this
      // build read its donor from is spared — verify r2), failed records and the rest go
      const pruned = pruneStoredKits(root, { keep: STORED_KEEP, current: dir, spare: out.rung === 'stored-kit' ? out.donorFrom : null });
      if (pruned.length) { out.pruned = pruned; log(`[design-kit] removed ${pruned.length} stored kit dir(s) beyond the newest ${STORED_KEEP} (failed records first): ${pruned.join(', ')}`); }
    } catch (e) {
      out.error = e.message;
    }
    let unwritten = '';
    try { fs.writeFileSync(kitFile + '.tmp', JSON.stringify(out, null, 2), { mode: 0o600 }); fs.renameSync(kitFile + '.tmp', kitFile); } catch (e) { unwritten = ` (record not written: ${e.code || e.message})`; }
    log(`[design-kit] ${out.ok ? 'ready' : 'NOT ready'}: CLI ${version} ${out.source || ''} ${out.error ? '— ' + out.error : ''}${unwritten}`);
    return out;
  }

  /** Ensure the kit for the installed CLI (cached per version). One build at a
   *  time. NEVER rejects (verify r2: a thrown EACCES left `last` unset and the
   *  status route without an answer): whatever escapes build() is the record. */
  function ensure({ force = false } = {}) {
    if (inflight) return inflight;
    inflight = build(force).catch((e) => ({ ok: false, version: null, error: refusalLine('?', 'build', e.message), rung: 'build', createdAt: Date.now() })).then((r) => { last = r; return r; }).finally(() => { inflight = null; });
    return inflight;
  }
  const status = () => last || { ok: false, error: 'design kit not prepared yet', pending: !!inflight };
  const KIT_FILES = ['seed-canvas.mjs', 'payload.template.html', 'SKILL.md', 'SKILL.orig.md'];
  const fileFor = (name) => {
    if (!last || !last.ok) return null;
    if (!KIT_FILES.includes(name)) return null;
    return path.join(last.dir, name);
  };
  /** The bytes of a kit file for the agent's door (/api/agent/design-kit/file/:name):
   *  read through readOwnFile — the file served is a regular file of our uid, a
   *  symlink entry is refused, never followed (verify r2) — AND the bytes handed
   *  out are the bytes the record names: re-hashed against `files` on every
   *  hand-out (verify r3: a same-uid rewrite after the build — through the file
   *  or a second hard-link name — was served against a record whose sha256 said
   *  otherwise; the next ensure() would have rebuilt, the hand-out in between
   *  never asked). null = not served, the reason logged. */
  const readKitFile = (name) => {
    const fp = fileFor(name);
    if (!fp) return null;
    try {
      const buf = readOwnFile(fp);
      if (sha(buf) !== (last.files || {})[name]) { log(`[design-kit] ${name} not served: it no longer matches the sha256 its record names — the next check rebuilds the kit`); return null; }
      return buf;
    } catch (e) { log(`[design-kit] ${name} not served: ${e.kitWhy || e.message}`); return null; }
  };

  /** Cookie-authed status for the chat status bar; `?refresh=1` rebuilds. */
  function registerRoutes(app) {
    app.get('/api/design-kit/status', async (req, res) => {
      // a FAILED build is retried on view once a minute (a transient failure at
      // boot must not pin a red line forever — review-caught); refresh=1 forces
      const stale = last && !last.ok && Date.now() - (last.createdAt || 0) > 60000;
      const r = (req.query.refresh === '1' || !last || stale) ? await ensure({ force: req.query.refresh === '1' }) : status();
      res.json({ ok: !!r.ok, version: r.version || null, source: r.source || null, dir: r.dir || null, error: r.error || null, cached: !!r.cached, rung: r.rung || null, donor: r.donorVersion || null, ownShipped: r.own ? r.own.shipped : null, code: r.code || null, lastShipped: r.lastShipped || null });
    });
  }

  return { ensure, status, fileFor, readKitFile, registerRoutes, adaptSkill, unescapeTemplate, findCliExtractedKit, _internals: { findOffsets, findAll, readTemplateLiteral, readPayloadAsset, extractPayload, extractFromZstd, extractPieces, readStoredKit, versionsDirsFor, packageDirsFor, HELPER_ANCHOR, CANVAS_MARKER } };
}

module.exports = { create, adaptSkill, unescapeTemplate, ownedDir, donorOrder, skippedDonors, judgeStoredDir, storedDirVerdict, readOwnFile, readBounded, ownStoredRoot, pruneStoredKits, compareVersions, parseVersion, listInstalledVersions, listStoredKits, LAST_SHIPPED, STORED_KEEP, MAX_BINARY, NPM_PACKAGE_ROOTS };
