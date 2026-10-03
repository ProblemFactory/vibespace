#!/usr/bin/env node
// Design kit (2.366.0): the pieces behind Claude Code's bundled /design
// skill, extracted from the INSTALLED CLI on the user's machine and adapted
// so that publishing goes to VibeSpace. Behavioral against the real CLI:
// ① extraction finds helper + payload + skill text (CLI-extracted dir first,
//   the binary otherwise) and writes a per-version kit;
// ② the kit's OWN helper seeds a sample artboard and its --check says ok
//   (the kit is usable, not just present);
// ③ PARITY: when the CLI's own /tmp extraction exists, our bytes equal its
//   bytes (sha256) — else logged as SKIP, never silently passed;
// ④ adaptation is all-or-nothing (anchors missing ⇒ error, never a
//   half-adapted text) and the adapted text carries the VibeSpace step;
// ⑤ unescape handles every escape the bundler emits.
// Skips (exit 0, loud) when no claude binary is resolvable — the kit cannot
// exist without one, and that is what the status popover says too.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const { create, adaptSkill, unescapeTemplate } = require(REPO + '/src/server/design-kit.js');

// ── 5. unescape (pure) ──
ok(unescapeTemplate('a \\u2014 b \\xB7 c \\` d \\\\ e \\$ f\\n') === 'a — b · c ` d \\ e $ f\n', 'unescapeTemplate: \\uXXXX \\xHH \\` \\\\ \\$ \\n');
ok(unescapeTemplate('x \\u{1F3A8} y') === 'x 🎨 y', 'unescapeTemplate: \\u{…} code points');

// ── 4. adaptation is all-or-nothing ──
{
  const fake = '---\nname: design\ndescription: "x"\n---\n\n# Create\n\nintro. Where saving is enabled (the\nartifact-publish capability — step 4 finds out) the viewer gets a\nWYSIWYG canvas … viewing plus PNG/PDF\nexport is what the user gets. Never edit the payload.\n\n## Workflow\n\n2. seed. If a resumed session lost the base\n   directory, re-run `/design` to re-extract it. With neither node nor bun stop.\n3. **Check it**: x\n4. **Publish** the seeded file with the `Artifact` tool, pinned\n   - roster stuff\n5. **Show the design** x\n\n## Updating an existing canvas\n\n- WebFetch the artifact URL\n\n## Artboards and canvas.json\n\nmiddle\n\n## How to talk to the user about it\n\nthe card the `Artifact` tool renders; mod-S updates the design for everyone; WRITE access\n\n## Foundation\n\nrest\n';
  const a = adaptSkill(fake);
  ok(!a.error && /4\. \*\*Publish to VibeSpace\.\*\*/.test(a.text) && a.text.includes('vibespace-page publish'), 'adaptSkill replaces step 4 with the VibeSpace publish step');
  const step4 = a.text.slice(a.text.indexOf('4. **Publish'), a.text.indexOf('5. **Show the design**'));
  const upd = a.text.slice(a.text.indexOf('## Updating an existing canvas'), a.text.indexOf('## Artboards and canvas.json'));
  ok(!/with the `Artifact` tool|artifact-capabilities|contract: "0/.test(step4) && /vibespace-page publish/.test(step4) && !/WebFetch/.test(upd) && /vibespace-page publish/.test(upd), 'step 4 is the VibeSpace publish (no Artifact-tool/roster/contract instruction); the updating section has no artifact read-back and republishes via vibespace-page');
  ok(a.text.includes('5. **Show the design**') && a.text.includes('## Artboards and canvas.json') && a.text.includes('middle') && a.text.endsWith('## Foundation\n\nrest\n'), 'everything outside the replaced blocks is preserved verbatim');
  ok(!/mod-S|WRITE access|`Artifact` tool renders/.test(a.text) && a.text.includes('## How to talk to the user about it') && a.text.includes('nothing is sent to\nclaude.ai'), 'the how-to-talk section is the VibeSpace version (no Save/WRITE-access/Artifact-card facts — review-caught)');
  ok(!/re-run `\/design` to re-extract/.test(a.text) && a.text.includes('run `vibespace-page kit` again'), 'the re-extract hint points at vibespace-page kit, not /design (review-caught)');
  ok(!/step 4 finds out/.test(a.text) && a.text.includes('VIEW-AND-EXPORT'), 'the saving sentence is the VibeSpace read-only statement (review-caught)');
  ok(!!adaptSkill(fake.replace('## How to talk to the user about it', '## Talking')).error, 'NEGATIVE: missing how-to-talk anchor ⇒ error');
  ok(!!adaptSkill(fake.replace('re-run `/design` to re-extract it', 'rerun it')).error, 'NEGATIVE: missing re-extract anchor ⇒ error');
  ok(/^---\nname: design\ndescription: "x"\n---\n\n> \*\*VibeSpace variant\.\*\*/.test(a.text), 'banner sits right after the frontmatter');
  ok(!!adaptSkill(fake.replace('4. **Publish**', '4. **Ship**')).error, 'NEGATIVE: missing publish anchor ⇒ error (no half-adapted text)');
  ok(!!adaptSkill(fake.replace('## Updating an existing canvas', '## Updating')).error, 'NEGATIVE: missing updating anchor ⇒ error');
}

// ── 6. CLI-extraction lookup: same version only, owned real dirs only ──
{
  const { ownedDir } = require(REPO + '/src/server/design-kit.js');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-kit-tmp-'));
  const uid = process.getuid();
  const base = path.join(tmpRoot, `claude-${uid}`, 'bundled-skills');
  const mk = (ver, hash) => { const d = path.join(base, ver, hash, 'design'); fs.mkdirSync(d, { recursive: true }); for (const p of [path.join(tmpRoot, `claude-${uid}`), base, path.join(base, ver), path.join(base, ver, hash), d]) fs.chmodSync(p, 0o700); fs.writeFileSync(path.join(d, 'seed-canvas.mjs'), '// h'); fs.writeFileSync(path.join(d, 'payload.template.html'), '<!doctype html>'); return d; };
  const prevTmp = process.env.TMPDIR; process.env.TMPDIR = tmpRoot;
  try {
    const dOld = mk('1.0.0', 'aaaa');
    const kit2 = create({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-kit-dd-')), claudeCmd: () => null });
    ok(kit2.findCliExtractedKit('1.0.0')?.dir === dOld, 'same-version extraction dir is found');
    ok(kit2.findCliExtractedKit('2.0.0') === null, 'another version\'s extraction is NOT used (skew with the binary\'s skill text — review-caught)');
    fs.chmodSync(path.join(base, '1.0.0', 'aaaa'), 0o777);
    ok(kit2.findCliExtractedKit('1.0.0') === null, 'a group/world-writable directory on the path is refused (we execute what we find there)');
    fs.chmodSync(path.join(base, '1.0.0', 'aaaa'), 0o700);
    const linkHash = path.join(base, '1.0.0', 'bbbb'); fs.mkdirSync(linkHash); fs.chmodSync(linkHash, 0o700);
    fs.symlinkSync(dOld, path.join(linkHash, 'design'));
    fs.utimesSync(path.join(dOld, 'payload.template.html'), new Date(0), new Date(0)); // the real one is OLDER: the symlink would win on mtime if accepted
    ok(kit2.findCliExtractedKit('1.0.0')?.dir === dOld, 'a symlinked design dir is skipped even when it is the newest');
    ok(ownedDir(dOld) === true && ownedDir(path.join(linkHash, 'design')) === false && ownedDir('/nonexistent') === false, 'ownedDir: real owned 0700 dir yes; symlink no; missing no');
  } finally { if (prevTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prevTmp; fs.rmSync(tmpRoot, { recursive: true, force: true }); }
}

// ── 7. THE DONOR PICK (lane design-kit-287): PURE table + patched-copy controls ──
// Claude Code 2.1.287 ships no design kit (measured: its /design router lost the
// canvas mode). The kit then comes from ANOTHER version on this machine — an
// installed binary or a kit this server stored — and `donorOrder` is the one rule
// (older than the running CLI only, newest first, binary before a stored copy at
// one version, one stored copy per donor version).
const DK_SRC = fs.readFileSync(path.join(REPO, 'src/server/design-kit.js'), 'utf8');
const DONOR_TABLE = [
  { name: 'newer + running excluded, newest first', running: '2.1.287',
    installed: [{ version: '2.1.280', path: 'b280' }, { version: '2.1.281', path: 'b281' }, { version: '2.1.287', path: 'b287' }, { version: '2.1.290', path: 'b290' }], stored: [],
    want: ['installed-version 2.1.281', 'installed-version 2.1.280'] },
  { name: 'stored copies interleave by version; one per donor, the dir named by it first', running: '2.1.288',
    installed: [{ version: '2.1.274', path: 'b274' }], stored: [{ version: '2.1.281', dir: '/k/2.1.287' }, { version: '2.1.281', dir: '/k/2.1.281' }, { version: '2.1.273', dir: '/k/2.1.273' }],
    want: ['stored-kit 2.1.281 /k/2.1.281', 'installed-version 2.1.274', 'stored-kit 2.1.273 /k/2.1.273'] },
  { name: 'at one version the installed binary before the stored copy', running: '2.1.287',
    installed: [{ version: '2.1.281', path: 'b281' }], stored: [{ version: '2.1.281', dir: '/k/2.1.281' }],
    want: ['installed-version 2.1.281', 'stored-kit 2.1.281 /k/2.1.281'] },
  { name: 'a stored kit whose donor is newer than the running CLI is never a donor', running: '2.1.287',
    installed: [], stored: [{ version: '2.1.290', dir: '/k/2.1.290' }, { version: '2.1.281', dir: '/k/2.1.287' }],
    want: ['stored-kit 2.1.281 /k/2.1.287'] },
  { name: 'a running hash id (not x.y.z) lets every x.y.z version in', running: 'bin-0123abcd4567',
    installed: [{ version: '2.1.280', path: 'b280' }, { version: '2.1.290', path: 'b290' }], stored: [],
    want: ['installed-version 2.1.290', 'installed-version 2.1.280'] },
  { name: 'a candidate that is not x.y.z is never a donor', running: '2.1.287',
    installed: [{ version: 'latest', path: 'bl' }, { version: '2.1.281.1', path: 'bx' }], stored: [{ version: 'bin-x', dir: '/k/bin-x' }],
    want: [] },
  { name: 'versions compare per number (2.1.99 < 2.1.100, 2.1.9 < 2.1.99)', running: '2.1.100',
    installed: [{ version: '2.1.9', path: 'b9' }, { version: '2.1.100', path: 'b100' }, { version: '2.1.99', path: 'b99' }], stored: [],
    want: ['installed-version 2.1.99', 'installed-version 2.1.9'] },
  { name: 'nothing on the machine ⇒ no donor', running: '2.1.287', installed: [], stored: [], want: [] },
];
const showRow = (r) => `${r.rung} ${r.version}${r.rung === 'stored-kit' ? ' ' + r.dir : ''}`;
function judgeDonorTable(mod) {
  const reds = [];
  for (const row of DONOR_TABLE) {
    const got = mod.donorOrder({ running: row.running, installed: row.installed, stored: row.stored }).map(showRow);
    if (JSON.stringify(got) !== JSON.stringify(row.want)) reds.push(`${row.name}: got ${JSON.stringify(got)}`);
  }
  return reds;
}
{
  const dk = require(REPO + '/src/server/design-kit.js');
  for (const row of DONOR_TABLE) {
    const got = dk.donorOrder({ running: row.running, installed: row.installed, stored: row.stored }).map(showRow);
    ok(JSON.stringify(got) === JSON.stringify(row.want), `donorOrder: ${row.name}`, JSON.stringify(got));
  }
  ok(dk.compareVersions('2.1.100', '2.1.99') > 0 && dk.compareVersions('2.1.287', '2.1.287') === 0 && dk.compareVersions('2.2.0', '2.1.999') > 0 && dk.compareVersions('x', '2.1.1') < 0, 'compareVersions: numeric per part; a non-version sorts below');
  ok(dk.LAST_SHIPPED === '2.1.281', 'LAST_SHIPPED is the last version measured to ship the kit (2.1.281)');
  // THE ROWS THE RULE DROPS, each with its reason (verify r1): a newer installed or stored version, a non-version; the running one itself is no row
  const sk = (args) => dk.skippedDonors(args).map((r) => `${r.rung} ${r.version}: ${r.why}`);
  ok(JSON.stringify(sk({ running: '2.1.287', installed: [{ version: '2.1.281', path: 'b' }, { version: '2.1.287', path: 'c' }, { version: '2.1.290', path: 'd' }], stored: [{ version: '2.1.291', dir: '/k/2.1.291' }, { version: 'bin-x', dir: '/k/x' }] })) === JSON.stringify(['installed-version 2.1.290: newer than the running CLI 2.1.287 — VibeSpace reads the kit only from an OLDER version, so this one is left alone', 'stored-kit 2.1.291: newer than the running CLI 2.1.287 — VibeSpace reads the kit only from an OLDER version, so this one is left alone', 'stored-kit bin-x: not a version']), 'skippedDonors: newer installed + newer stored named with the rule, a non-version named, the running version and the older ones are no rows');
  ok(sk({ running: 'bin-0123', installed: [{ version: '2.1.290', path: 'd' }], stored: [] }).length === 0, 'skippedDonors: a running hash id skips nothing (every x.y.z is admitted)');
  ok(dk.STORED_KEEP === 8 && dk.NPM_PACKAGE_ROOTS().every((p) => /[\\/]lib[\\/]node_modules[\\/]@anthropic-ai[\\/]claude-code$/.test(p)) && dk.NPM_PACKAGE_ROOTS().some((p) => p.startsWith('/usr/local/')), 'STORED_KEEP is 8; the npm package roots end in lib/node_modules/@anthropic-ai/claude-code and include /usr/local (the fleet image)');
  // CONTROLS: the rule's two halves, each removed in a patched copy, turn the table red
  const M = mutantCopies('design-kit', REPO);
  const OLDER = 'compareVersions(v, running) < 0';
  const TIE = "(a.rung === b.rung ? 0 : a.rung === 'installed-version' ? -1 : 1)";
  ok(DK_SRC.split(OLDER).length === 2 && DK_SRC.split(TIE).length === 2, 'the two control anchors are each in the module exactly once');
  const newer = M.load('src/server/design-kit.js', DK_SRC.replace(OLDER, 'compareVersions(v, running) !== 0'), 'newer-donor');
  const reds1 = judgeDonorTable(newer);
  ok(reds1.length >= 2 && reds1.some((r) => /newer \+ running excluded/.test(r)) && reds1.some((r) => /donor is newer/.test(r)), `CONTROL: a copy that lets a NEWER version donate is red on the table (${reds1.length} rows)`, reds1.join(' | '));
  // (a `0` tie would stay green: the sort is stable and the binaries are pushed
  // first — so the control REVERSES the tie, the one edit that can break the rule)
  const tie = M.load('src/server/design-kit.js', DK_SRC.replace(TIE, "(a.rung === b.rung ? 0 : a.rung === 'installed-version' ? 1 : -1)"), 'copy-first');
  const reds2 = judgeDonorTable(tie);
  ok(reds2.some((r) => /installed binary before the stored copy/.test(r)), `CONTROL: a copy that puts the stored copy before the binary is red on the table (${reds2.length} rows)`, reds2.join(' | '));
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: 'design-kit controls: ' })) ok(c.pass, c.name, c.detail);
}

// ── 8. THE LADDER, synthetic: fake CLI binaries carrying real zstd frames ──
// Runs wherever Node has zstd (≥22.15). A fake "2.1.287" carries nothing, a fake
// "2.1.281" carries a skill / helper / payload as zstd frames between junk, a fake
// "2.1.290" carries a DIFFERENT payload (newer than the running CLI: never used).
// the fake kit (shared by §8 and §10): a skill with every adaptation anchor, a helper whose --check says ok, a 600 KB payload
const FAKE_SKILL = '---\nname: design\ndescription: "x"\n---\n\n# Create\n\nintro. Where saving is enabled (the\nartifact-publish capability — step 4 finds out) the viewer gets a\nWYSIWYG canvas … viewing plus PNG/PDF\nexport is what the user gets. Never edit the payload.\n\n## Workflow\n\n2. seed with seed-canvas.mjs. If a resumed session lost the base\n   directory, re-run `/design` to re-extract it. With neither node nor bun stop.\n3. **Check it**: x\n4. **Publish** the seeded file with the `Artifact` tool, pinned\n   - roster stuff\n5. **Show the design** x\n\n## Updating an existing canvas\n\n- WebFetch the artifact URL\n\n## Artboards and canvas.json\n\nmiddle\n\n## How to talk to the user about it\n\nthe card the `Artifact` tool renders\n\n## Foundation\n\nrest ' + 'x'.repeat(300) + '\n';
const FAKE_HELPER = "// Design-canvas seeding helper. (a FAKE: copies the template, --check says ok)\nimport fs from 'node:fs';\nconst a = process.argv.slice(2), at = (k) => a[a.indexOf(k) + 1];\nif (a.includes('--check')) { const f = at('--check'); if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('appifact-doc')) { console.log('ok: ' + f); process.exit(0); } console.error('bad ' + f); process.exit(1); }\nfs.copyFileSync(at('--template'), at('--out'));\n// " + 'p'.repeat(300) + '\n';
const payload = (tag) => '<!doctype html>\n<html><head><title>APPIFACT-TITLE-PLACE</title></head><body><div id="appifact-doc" data-tag="' + tag + '"></div>' + 'y'.repeat(600000) + '</body></html>\n';
const frame = (s) => zlibMod.zstdCompressSync(Buffer.from(s));
const junk = (n) => Buffer.from('not a frame, just bytes. '.repeat(n));
const carrier = (tag) => Buffer.concat([junk(400), Buffer.from('export{p as loadDesignCanvasFiles};'), junk(50), frame(FAKE_SKILL), junk(30), frame(FAKE_HELPER), junk(30), frame(payload(tag)), junk(400)]);
const zlibMod = require('node:zlib');
if (typeof zlibMod.zstdCompressSync !== 'function') {
  console.log('  SKIP: this Node has no zlib zstd (needs ≥22.15) — the synthetic ladder is not exercised');
} else {
  const { create: createKit } = require(REPO + '/src/server/design-kit.js');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-ladder-'));
  try {
    const vers = path.join(work, 'm1', 'versions'); fs.mkdirSync(vers, { recursive: true });
    fs.writeFileSync(path.join(vers, '2.1.287'), junk(5000));
    fs.writeFileSync(path.join(vers, '2.1.281'), carrier('from-281'));
    fs.writeFileSync(path.join(vers, '2.1.290'), carrier('from-290-NEWER'));
    const data1 = path.join(work, 'data1'); fs.mkdirSync(data1);
    const kitA = createKit({ dataDir: data1, claudeCmd: () => path.join(vers, '2.1.287'), versionsDirs: [vers], packageDirs: [] });
    const a = await kitA.ensure();
    ok(a.ok === true && a.donorVersion === '2.1.281' && a.rung === 'installed-version', 'ladder: the running 2.1.287 (no kit) takes its kit from the installed 2.1.281', a.error || JSON.stringify({ donor: a.donorVersion, rung: a.rung }));
    ok(a.source === 'binary-extracted (zstd, from CLI 2.1.281 — this CLI 2.1.287 carries no design kit)', 'ladder: the record SAYS the skew (source names the donor and that this CLI carries no kit)', a.source);
    ok(a.own && a.own.shipped === false && a.own.rung === 'binary-zstd' && /does not ship the design canvas kit/.test(a.own.why), "ladder: the running CLI's own answer is kept in the record (rung + why, shipped:false)", JSON.stringify(a.own));
    const pay = a.ok ? fs.readFileSync(path.join(a.dir, 'payload.template.html'), 'utf8') : '';
    ok(pay.includes('from-281') && !pay.includes('NEWER'), 'ladder: the NEWER installed 2.1.290 is never the donor (the payload is 2.1.281\'s)');
    ok(a.ok && fs.readFileSync(path.join(a.dir, 'SKILL.md'), 'utf8').includes('vibespace-page publish'), "ladder: the donor's skill is adapted like the CLI's own");
    const a2 = await kitA.ensure();
    ok(a2.cached === true && a2.donorVersion === '2.1.281' && a2.source === a.source, 'ladder: the second ensure is the cached kit and still names its donor');
    // the status route answers the donor + the running CLI's own verdict
    const routes = {}; kitA.registerRoutes({ get: (p, fn) => { routes[p] = fn; } });
    let body = null; await routes['/api/design-kit/status']({ query: {} }, { json: (x) => { body = x; } });
    ok(body && body.ok === true && body.donor === '2.1.281' && body.ownShipped === false && body.rung === 'installed-version' && body.code === null, '/api/design-kit/status carries donor, ownShipped, rung', JSON.stringify(body));
    ok(JSON.stringify(kitA._internals.versionsDirsFor('/opt/x/versions/2.1.287')) === JSON.stringify([vers]) && createKit({ dataDir: data1, claudeCmd: () => null })._internals.versionsDirsFor('/opt/x/versions/2.1.287')[0] === '/opt/x/versions', 'versions dirs: explicit when given, else the running binary\'s own versions dir first');

    // STORED rung: the next CLI (2.1.288) has no kit and no kit-carrying binary is left
    const vers2 = path.join(work, 'm2', 'versions'); fs.mkdirSync(vers2, { recursive: true });
    fs.writeFileSync(path.join(vers2, '2.1.288'), junk(5000));
    fs.writeFileSync(path.join(vers2, '2.1.287'), junk(5000));
    const kitB = createKit({ dataDir: data1, claudeCmd: () => path.join(vers2, '2.1.288'), versionsDirs: [vers2], packageDirs: [] });
    const b = await kitB.ensure();
    ok(b.ok === true && b.rung === 'stored-kit' && b.donorVersion === '2.1.281' && /^stored kit \(.*2\.1\.287, from CLI 2\.1\.281 — this CLI 2\.1\.288 carries no design kit\)$/.test(b.source || ''), 'ladder: after the updater purged every carrier, the kit this server stored earlier serves (donor named)', b.error || b.source);
    ok(b.ok && fs.readFileSync(path.join(b.dir, 'payload.template.html'), 'utf8').includes('from-281'), 'ladder: the stored copy is the same donor bytes');

    // A TAMPERED stored copy is no kit; with nothing else, the refusal names everything
    const data2 = path.join(work, 'data2'); fs.mkdirSync(path.join(data2, 'design-kit'), { recursive: true });
    fs.cpSync(path.join(data1, 'design-kit', '2.1.287'), path.join(data2, 'design-kit', '2.1.287'), { recursive: true });
    fs.appendFileSync(path.join(data2, 'design-kit', '2.1.287', 'payload.template.html'), '<!-- changed -->');
    const c = await createKit({ dataDir: data2, claudeCmd: () => path.join(vers2, '2.1.288'), versionsDirs: [vers2], packageDirs: [] }).ensure();
    ok(c.ok === false && c.code === 'not_shipped' && c.lastShipped === '2.1.281', 'refusal: a changed stored copy is refused; no donor ⇒ not ready, code not_shipped, the last version known to ship it named', JSON.stringify({ ok: c.ok, code: c.code, last: c.lastShipped }));
    ok(/^CLI 2\.1\.288 — the binary's zstd frames: this CLI does not ship/.test(c.error || '') && /2\.1\.281 stored kit — a kit this server stored earlier: its files no longer match the sha256/.test(c.error) && /2\.1\.287 installed — the binary's zstd frames/.test(c.error) && /press Retry/.test(c.error) && /\/design in a terminal session/.test(c.error), 'refusal: names the version and the rung of every answer (own, each candidate) and the two ways out', c.error);
    ok(!/layout changed again\?/.test(c.error || ''), 'refusal: never the generic "layout changed again?"');
    const gone = await createKit({ dataDir: path.join(work, 'data6'), claudeCmd: () => null })._internals.extractPieces(path.join(vers2, '2.1.999'), '2.1.999', { cliExtracted: false });
    ok(gone.ok === false && gone.rung === 'binary-read' && /ENOENT/.test(gone.why), 'refusal: a binary that cannot be read is named as such (rung binary-read), never as the extraction dir', JSON.stringify(gone));
    const d = await createKit({ dataDir: path.join(work, 'data3'), claudeCmd: () => path.join(vers2, '2.1.288'), versionsDirs: [path.join(work, 'nowhere')], packageDirs: [] }).ensure();
    ok(d.ok === false && /no other version under .*nowhere and no stored kit/.test(d.error || ''), 'refusal: an empty machine says where it looked', d.error);

    // only a NEWER version carries it ⇒ refused (the rule end to end)
    const vers3 = path.join(work, 'm3', 'versions'); fs.mkdirSync(vers3, { recursive: true });
    fs.writeFileSync(path.join(vers3, '2.1.287'), junk(5000));
    fs.writeFileSync(path.join(vers3, '2.1.290'), carrier('from-290-NEWER'));
    const e = await createKit({ dataDir: path.join(work, 'data4'), claudeCmd: () => path.join(vers3, '2.1.287'), versionsDirs: [vers3], packageDirs: [] }).ensure();
    ok(e.ok === false && e.code === 'not_shipped' && /skipped: 2\.1\.290 installed — newer than the running CLI/.test(e.error || '') && !/no other version under/.test(e.error || ''), 'ladder: a kit only a NEWER installed version carries is not taken — and the refusal NAMES it as skipped by the rule (verify r1: it used to say "no other version")', e.error);

    // the canvas code present but no frames ⇒ "layout changed" (not "does not ship"), named
    const vers4 = path.join(work, 'm4', 'versions'); fs.mkdirSync(vers4, { recursive: true });
    fs.writeFileSync(path.join(vers4, '2.1.299'), Buffer.concat([junk(500), Buffer.from('export{p as loadDesignCanvasFiles};'), junk(500)]));
    const g = await createKit({ dataDir: path.join(work, 'data5'), claudeCmd: () => path.join(vers4, '2.1.299'), versionsDirs: [vers4], packageDirs: [] }).ensure();
    ok(g.ok === false && g.code === 'unreadable' && /^CLI 2\.1\.299 — the binary's zstd frames: the design canvas code is in this CLI but its skill text is in neither/.test(g.error || ''), 'refusal: canvas code without its frames is a named layout change, code unreadable', g.error);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

// ── 9. THE VERSION TABLE: what each Claude Code version does with the kit ──
// MEASURED 2026-10-02 by reading the binaries as bytes (166 zstd frames decoded
// in each). Read off the installed binaries when present, SKIP by name when not.
// The `router` probe is the /design router's `return"canvas"` (types → canvas →
// hub → consent in a carrier; types → hub → consent in 2.1.287).
const VERSION_ROWS = [
  { version: '2.1.280', carries: true, canvas: true },
  { version: '2.1.281', carries: true, canvas: true, sizes: { skill: 56496, helper: 40699, payload: 2488483 } },
  { version: '2.1.287', carries: false, canvas: false },
];
let versionsDir = process.env.VIBESPACE_TEST_CLAUDE_VERSIONS || null;
if (!versionsDir) {
  try { const real = fs.realpathSync(execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim()); if (/[\\/]versions[\\/]\d+\.\d+\.\d+$/.test(real)) versionsDir = path.dirname(real); } catch { }
}
if (!versionsDir) versionsDir = path.join(os.homedir(), '.local', 'share', 'claude', 'versions');
{
  const { create: createKit } = require(REPO + '/src/server/design-kit.js');
  const probe = createKit({ dataDir: os.tmpdir(), claudeCmd: () => null });
  for (const row of VERSION_ROWS) {
    const bin = path.join(versionsDir, row.version);
    if (!fs.existsSync(bin)) { console.log(`  SKIP: CLI ${row.version} is not installed here (${bin}) — its row is not measured on this machine`); continue; }
    const r = await probe._internals.extractPieces(bin, row.version, { cliExtracted: false });
    const offs = await probe._internals.findOffsets(bin, [Buffer.from('return"canvas"'), probe._internals.CANVAS_MARKER]);
    const canvas = offs.has(probe._internals.CANVAS_MARKER), router = offs.size === 2 ? true : offs.has(probe._internals.CANVAS_MARKER) ? 'marker only' : offs.size ? 'router only' : false;
    ok(r.ok === row.carries, `version row ${row.version}: ${row.carries ? 'carries the skill / helper / payload frames' : 'carries no kit'}`, r.ok ? '' : `${r.rung}: ${r.why}`);
    ok(canvas === row.canvas && router === row.canvas, `version row ${row.version}: canvas module ${row.canvas ? 'and the router\'s canvas mode present' : 'and the router\'s canvas mode absent (/design = types → hub → consent)'}`, `marker ${canvas}, router ${router}`);
    if (!row.carries) ok(r.shipped === false && /does not ship/.test(r.why || ''), `version row ${row.version}: the refusal says "does not ship" (not "layout changed")`, r.why);
    if (row.sizes && r.ok) ok(Buffer.byteLength(r.skill) === row.sizes.skill && r.helperBuf.length === row.sizes.helper && r.payloadBuf.length === row.sizes.payload, `version row ${row.version}: the frames are the measured ones (skill ${row.sizes.skill} B, helper ${row.sizes.helper} B, payload ${row.sizes.payload} B)`, `${Buffer.byteLength(r.skill)} / ${r.helperBuf.length} / ${r.payloadBuf.length}`);
  }
  // the real ladder on this machine: a running CLI without the kit + an older carrier ⇒ a working kit from it
  const carrier = VERSION_ROWS.filter((v) => v.carries && fs.existsSync(path.join(versionsDir, v.version))).map((v) => v.version).sort(compareVersionsLocal).pop();
  const bare = VERSION_ROWS.find((v) => !v.carries && fs.existsSync(path.join(versionsDir, v.version)));
  if (!carrier || !bare) console.log(`  SKIP: the real ladder needs an installed kit-less CLI and an older carrier under ${versionsDir} — not measured here`);
  else {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-real-'));
    try {
      const real = await createKit({ dataDir, claudeCmd: () => path.join(versionsDir, bare.version), versionsDirs: [versionsDir], packageDirs: [] }).ensure();
      const newestOlder = fs.readdirSync(versionsDir).filter((n) => /^\d+\.\d+\.\d+$/.test(n) && compareVersionsLocal(n, bare.version) < 0).sort(compareVersionsLocal).reverse();
      ok(real.ok === true && real.rung === 'installed-version' && newestOlder.includes(real.donorVersion) && real.source === `binary-extracted (zstd, from CLI ${real.donorVersion} — this CLI ${bare.version} carries no design kit)`, `REAL: CLI ${bare.version} gets a validated kit from the installed CLI ${real.donorVersion} (helper --check ok)`, real.error || real.source);
      // verify r1 (T2 ③, the skew): the donor's text runs under a CLI whose /design has no canvas mode — the adapted SKILL.md must tell the AGENT to run no `/design` command and name no CLI path; its only `/design <verb>` lines are the user-facing pointers of the "Two quick exits" paragraph (consent / sync — modes 2.1.287 keeps: types → hub → consent)
      if (real.ok) {
        const txt = fs.readFileSync(path.join(real.dir, 'SKILL.md'), 'utf8');
        const exits = txt.slice(txt.indexOf('**Two quick exits.**'), txt.indexOf('This is an early preview'));
        const outside = txt.replace(exits, '');
        ok(exits.length > 100 && !/`\/design/.test(outside) && !/\/tmp\/claude-/.test(txt) && !/re-run `\/design`/.test(txt) && txt.includes('run `vibespace-page kit` again'), `REAL: the adapted text of CLI ${real.donorVersion} tells the agent to run no /design command (its /design mentions are the exits paragraph's user pointers) and names no CLI path`, (outside.match(/.{0,60}`\/design.{0,60}/g) || []).join(' | '));
      }
    } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  }
}
function compareVersionsLocal(a, b) { return require(REPO + '/src/server/design-kit.js').compareVersions(a, b); }

// ── 10. THE DONOR TABLE over the real ladder (verify r1, T1): candidates × what the kit needs ⇒ pick / refused BY NAME; a control per rule ──
// The invariant: the helper that will EXECUTE (seed-canvas.mjs — the build runs
// its --check, the agent runs it after) comes only from a binary WE read or a
// stored copy whose dir is ours (a real dir of our uid, never a symlink, never
// world-writable; group-writable we own is tightened) AND whose files are the
// sha256 its kit.json recorded. Who wrote a kit.json is provable only to the
// uid — a same-uid planter is us; the door refuses everything else by name.
if (typeof zlibMod.zstdCompressSync === 'function') {
  const dkMod = require(REPO + '/src/server/design-kit.js');
  const { STORED_KEEP } = dkMod;
  const markerHelper = (marker) => FAKE_HELPER.replace("import fs from 'node:fs';\n", "import fs from 'node:fs';\nfs.writeFileSync(" + JSON.stringify(marker) + ", 'EXECUTED\\n', { flag: 'a' });\n");
  const carrierOf = (tag, { skill = true, helper = true, pay = true, marker = null } = {}) => Buffer.concat([junk(400), Buffer.from('export{p as loadDesignCanvasFiles};'), junk(50), skill ? frame(FAKE_SKILL) : junk(5), junk(30), helper ? frame(marker ? markerHelper(marker) : FAKE_HELPER) : junk(5), junk(30), pay ? frame(payload(tag)) : junk(5), junk(400)]);
  const vdir = (w) => path.join(w, 'versions');
  const binary = (w, v, buf) => { fs.mkdirSync(vdir(w), { recursive: true }); fs.writeFileSync(path.join(vdir(w), v), buf); };
  const build = (mod, w, running, opts = {}) => mod.create({ dataDir: path.join(w, 'data'), claudeCmd: () => path.join(vdir(w), running), versionsDirs: [vdir(w)], packageDirs: opts.packageDirs || [], log: () => { } }).ensure();
  // a kit this server stored EARLIER = a real build by an earlier run on that version, the carrier purged afterwards (the updater's way)
  const storedEarlier = async (mod, w, v, tag, marker = null) => { binary(w, v, carrierOf(tag, { marker })); const r = await build(mod, w, v); if (!r.ok) throw new Error('fixture: ' + r.error); fs.rmSync(path.join(vdir(w), v)); if (marker) try { fs.rmSync(marker); } catch { } return r.dir; };
  // a PLANTED kit dir: files + a SELF-WRITTEN kit.json whose shas match them (what a dropper would write)
  const plant = (dir, { version, helper, pay }) => { fs.mkdirSync(dir, { recursive: true }); const skill = FAKE_SKILL; fs.writeFileSync(path.join(dir, 'seed-canvas.mjs'), helper); fs.writeFileSync(path.join(dir, 'payload.template.html'), pay); fs.writeFileSync(path.join(dir, 'SKILL.orig.md'), skill); fs.writeFileSync(path.join(dir, 'SKILL.md'), 'adapted ' + skill); fs.writeFileSync(path.join(dir, 'kit.json'), JSON.stringify({ ok: true, version, files: { 'seed-canvas.mjs': sha(helper), 'payload.template.html': sha(pay), 'SKILL.md': sha('adapted ' + skill), 'SKILL.orig.md': sha(skill) }, createdAt: Date.now() })); };
  const kitRoot = (w) => path.join(w, 'data', 'design-kit');
  const marker = (w) => path.join(w, 'EXECUTED');
  const ROWS = [
    { name: 'the running CLI carries it ⇒ its own binary (rung binary-zstd), no donor', async run(mod, w) { binary(w, '2.1.281', carrierOf('own')); const r = await build(mod, w, '2.1.281'); return r.ok && r.rung === 'binary-zstd' && !r.donorVersion ? null : r.error || JSON.stringify(r.rung); } },
    { name: 'kit-less running + two older installed ⇒ the newest older binary (2.1.281 over 2.1.280), kind binary', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, '2.1.280', carrierOf('280')); binary(w, '2.1.281', carrierOf('281')); const r = await build(mod, w, '2.1.287'); return r.ok && r.rung === 'installed-version' && r.donorVersion === '2.1.281' && r.donorKind === 'binary' && fs.readFileSync(path.join(r.dir, 'payload.template.html'), 'utf8').includes('data-tag="281"') ? null : r.error || JSON.stringify([r.rung, r.donorVersion, r.donorKind]); } },
    { name: 'the newest older binary lacks the HELPER frame ⇒ passed over by name (record.tried), the next older serves', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, '2.1.280', carrierOf('280')); binary(w, '2.1.281', carrierOf('281', { helper: false })); const r = await build(mod, w, '2.1.287'); return r.ok && r.donorVersion === '2.1.280' && (r.tried || []).some((t) => /^2\.1\.281 installed — the binary's zstd frames: design helper\/payload zstd frames not found/.test(t)) ? null : r.error || JSON.stringify([r.donorVersion, r.tried]); } },
    { name: 'a binary with helper + payload but no SKILL frame (canvas code present) ⇒ refused as a named layout change, no pick', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, '2.1.281', carrierOf('281', { skill: false })); const r = await build(mod, w, '2.1.287'); return !r.ok && /looked at: 2\.1\.281 installed — the binary's zstd frames: the design canvas code is in this CLI but its skill text is in neither/.test(r.error || '') ? null : r.error || 'ok'; } },
    { name: 'only a NEWER installed binary carries it ⇒ no donor; the newer one NAMED as skipped, with the rule', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, '2.1.290', carrierOf('290')); const r = await build(mod, w, '2.1.287'); return !r.ok && r.code === 'not_shipped' && /skipped: 2\.1\.290 installed — newer than the running CLI 2\.1\.287 — VibeSpace reads the kit only from an OLDER version, so this one is left alone/.test(r.error || '') ? null : r.error || 'ok'; } },
    { name: 'a kit this server stored earlier (older) after the updater purged its binary ⇒ the stored rung, donor named', async run(mod, w) { await storedEarlier(mod, w, '2.1.281', '281'); binary(w, '2.1.288', junk(5000)); const r = await build(mod, w, '2.1.288'); return r.ok && r.rung === 'stored-kit' && r.donorVersion === '2.1.281' && /from CLI 2\.1\.281 — this CLI 2\.1\.288 carries no design kit/.test(r.source) ? null : r.error || r.source; } },
    { name: 'a kit this server stored earlier of a NEWER version (the user downgraded) ⇒ never a donor, NAMED as skipped', async run(mod, w) { await storedEarlier(mod, w, '2.1.290', '290'); binary(w, '2.1.287', junk(5000)); const r = await build(mod, w, '2.1.287'); return !r.ok && /skipped: 2\.1\.290 stored kit — newer than the running CLI/.test(r.error || '') ? null : r.error || 'ok'; } },
    { name: 'a stored kit whose helper changed by ONE byte ⇒ refused by its sha BEFORE --check (the helper never runs), named', async run(mod, w) { const m = marker(w); const dir = await storedEarlier(mod, w, '2.1.281', '281', m); const h = path.join(dir, 'seed-canvas.mjs'); const b = fs.readFileSync(h); b[b.length - 5] ^= 1; fs.writeFileSync(h, b); binary(w, '2.1.288', junk(5000)); const r = await build(mod, w, '2.1.288'); return !r.ok && !fs.existsSync(m) && /looked at: 2\.1\.281 stored kit — a kit this server stored earlier: its files no longer match the sha256 its kit\.json recorded/.test(r.error || '') ? null : (fs.existsSync(m) ? 'THE HELPER RAN; ' : '') + (r.error || 'ok'); } },
    { name: 'a PLANTED kit dir that is a SYMLINK (self-written kit.json, foreign helper) ⇒ refused at the door, the helper never runs', async run(mod, w) { const m = marker(w); binary(w, '2.1.287', junk(5000)); const elsewhere = path.join(w, 'elsewhere'); plant(elsewhere, { version: '2.1.275', helper: markerHelper(m), pay: payload('planted') }); fs.mkdirSync(kitRoot(w), { recursive: true }); fs.symlinkSync(elsewhere, path.join(kitRoot(w), '2.1.275')); const r = await build(mod, w, '2.1.287'); return !r.ok && !fs.existsSync(m) && /refused at the door: 2\.1\.275 stored kit — its dir is a symlink/.test(r.error || '') ? null : (fs.existsSync(m) ? 'THE HELPER RAN; ' : '') + (r.error || 'ok'); } },
    { name: 'a PLANTED kit dir that is WORLD-WRITABLE ⇒ refused at the door, the helper never runs', async run(mod, w) { const m = marker(w); binary(w, '2.1.287', junk(5000)); const d = path.join(kitRoot(w), '2.1.275'); plant(d, { version: '2.1.275', helper: markerHelper(m), pay: payload('planted') }); fs.chmodSync(d, 0o777); const r = await build(mod, w, '2.1.287'); return !r.ok && !fs.existsSync(m) && /refused at the door: 2\.1\.275 stored kit — its dir is world-writable/.test(r.error || '') ? null : (fs.existsSync(m) ? 'THE HELPER RAN; ' : '') + (r.error || 'ok'); } },
    { name: 'a kit dir WE OWN that is group-writable (umask 002 — every kit before this rule) ⇒ tightened to 0700 and served', async run(mod, w) { const dir = await storedEarlier(mod, w, '2.1.281', '281'); fs.chmodSync(dir, 0o775); fs.chmodSync(kitRoot(w), 0o775); binary(w, '2.1.288', junk(5000)); const r = await build(mod, w, '2.1.288'); const mode = fs.lstatSync(dir).mode & 0o777, rootMode = fs.lstatSync(kitRoot(w)).mode & 0o777; return r.ok && r.rung === 'stored-kit' && mode === 0o700 && rootMode === 0o700 ? null : (r.error || '') + ` mode ${mode.toString(8)} root ${rootMode.toString(8)}`; } },
    { name: 'the kit dir a build writes is 0700', async run(mod, w) { binary(w, '2.1.281', carrierOf('own')); const r = await build(mod, w, '2.1.281'); const mode = fs.lstatSync(r.dir).mode & 0o777; return r.ok && mode === 0o700 ? null : `mode ${mode.toString(8)}`; } },
    { name: 'a versions entry that is not x.y.z (latest, 2.1.281-beta) and a stored dir not named by a version ⇒ never candidates, never named', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, 'latest', carrierOf('latest')); binary(w, '2.1.281-beta', carrierOf('beta')); plant(path.join(kitRoot(w), 'bin-xyz'), { version: 'bin-xyz', helper: FAKE_HELPER, pay: payload('x') }); const r = await build(mod, w, '2.1.287'); return !r.ok && /no other version under/.test(r.error || '') && !/latest|beta|bin-xyz/.test(r.error || '') ? null : r.error || 'ok'; } },
    { name: "the fleet pod: the image's npm package (older) is a donor — package.json's version, cli.js read as bytes, named as npm", async run(mod, w) { binary(w, '2.1.287', junk(5000)); const pkg = path.join(w, 'usr', 'local', 'lib', 'node_modules', '@anthropic-ai', 'claude-code'); fs.mkdirSync(pkg, { recursive: true }); fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', version: '2.1.281' })); fs.writeFileSync(path.join(pkg, 'cli.js'), carrierOf('npm-281')); const r = await build(mod, w, '2.1.287', { packageDirs: [pkg] }); return r.ok && r.donorKind === 'npm' && r.donorVersion === '2.1.281' && r.donorFrom === path.join(pkg, 'cli.js') && /from CLI 2\.1\.281 — this CLI 2\.1\.287 carries no design kit/.test(r.source) ? null : r.error || JSON.stringify([r.donorKind, r.donorVersion, r.donorFrom]); } },
    { name: 'an npm package of another name, a non-version version, a NEWER version (named as skipped) or a missing cli.js ⇒ never a donor', async run(mod, w) { binary(w, '2.1.287', junk(5000)); const mk = (n, pkgJson, cli) => { const d = path.join(w, 'pk', n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkgJson)); if (cli) fs.writeFileSync(path.join(d, 'cli.js'), cli); return d; }; const pkgs = [mk('other', { name: '@anthropic-ai/other', version: '2.1.281' }, carrierOf('o')), mk('nover', { name: '@anthropic-ai/claude-code', version: 'next' }, carrierOf('n')), mk('newer', { name: '@anthropic-ai/claude-code', version: '2.1.290' }, carrierOf('new')), mk('nocli', { name: '@anthropic-ai/claude-code', version: '2.1.281' }, null)]; const r = await build(mod, w, '2.1.287', { packageDirs: pkgs }); return !r.ok && /skipped: 2\.1\.290 installed \(npm package\) — newer/.test(r.error || '') && !/2\.1\.281/.test((r.error || '').replace(/known to ship it: 2\.1\.281|binary of 2\.1\.281 or older/g, '')) ? null : r.error || 'ok'; } },
    { name: 'the CACHED kit is served only while its files match the recorded sha: a swapped helper ⇒ rebuilt through the ladder, the swap never served, the helper never run', async run(mod, w) { const m = marker(w); binary(w, '2.1.287', junk(5000)); binary(w, '2.1.281', carrierOf('281')); const a = await build(mod, w, '2.1.287'); if (!a.ok) return 'fixture: ' + a.error; fs.writeFileSync(path.join(a.dir, 'seed-canvas.mjs'), markerHelper(m)); const kit = mod.create({ dataDir: path.join(w, 'data'), claudeCmd: () => path.join(vdir(w), '2.1.287'), versionsDirs: [vdir(w)], packageDirs: [], log: () => { } }); const b = await kit.ensure(); const served = kit.fileFor('seed-canvas.mjs'); return !b.cached && b.ok && served && sha(fs.readFileSync(served)) === b.files['seed-canvas.mjs'] && !fs.existsSync(m) ? null : (fs.existsSync(m) ? 'THE SWAPPED HELPER RAN; ' : '') + JSON.stringify({ cached: b.cached, ok: b.ok, match: served && sha(fs.readFileSync(served)) === b.files['seed-canvas.mjs'] }); } },
    { name: `stored kits are BOUNDED: after ${STORED_KEEP + 4} CLI versions only the newest ${STORED_KEEP} dirs remain, the one just built among them, the removed named in the record`, async run(mod, w) { let r = null; const vs = []; for (let i = 0; i < STORED_KEEP + 4; i++) { const v = `2.1.${200 + i * 3}`; vs.push(v); binary(w, v, carrierOf(v)); r = await build(mod, w, v); if (!r.ok) return 'fixture: ' + r.error; } const left = fs.readdirSync(kitRoot(w)).sort(dkMod.compareVersions); const expect = vs.slice(-STORED_KEEP); return left.length === STORED_KEEP && JSON.stringify(left) === JSON.stringify(expect) && fs.existsSync(r.dir) && Array.isArray(r.pruned) && r.pruned.length === 1 && r.pruned[0] === vs[3] ? null : JSON.stringify({ left, pruned: r.pruned }); } },
  ];
  async function judgeLadder(mod, names = null) {
    const reds = [];
    for (const row of ROWS) {
      if (names && !names.includes(row.name)) continue;
      const w = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-table-'));
      try { const red = await row.run(mod, w); if (red) reds.push(`${row.name}: ${red}`); } catch (e) { reds.push(`${row.name}: threw ${e.message}`); } finally { fs.rmSync(w, { recursive: true, force: true }); }
    }
    return reds;
  }
  const realReds = await judgeLadder(dkMod);
  for (const row of ROWS) ok(!realReds.some((r) => r.startsWith(row.name + ':')), `donor table: ${row.name}`, realReds.find((r) => r.startsWith(row.name + ':')));
  // the PURE judge: every cell of the dir verdict (the uid cell needs no second user)
  { const J = dkMod.judgeStoredDir; const st = (o) => ({ isSymbolicLink: () => !!o.link, isDirectory: () => o.dir !== false, uid: o.uid ?? 1000, mode: o.mode ?? 0o40700 });
    ok(J(null, 1000).why === 'its dir is missing' && J(st({ link: true }), 1000).why === 'its dir is a symlink' && J(st({ dir: false }), 1000).why === 'it is not a directory' && J(st({ uid: 0 }), 1000).why === 'its dir belongs to another uid' && /world-writable/.test(J(st({ mode: 0o40777 }), 1000).why) && /world-writable/.test(J(st({ mode: 0o40702 }), 1000).why), 'judgeStoredDir: missing / symlink / not a dir / another uid / world-writable (o+w with or without the rest) refused by name');
    ok(J(st({ mode: 0o40775 }), 1000).ok === true && J(st({ mode: 0o40775 }), 1000).tighten === true && J(st({ mode: 0o40750 }), 1000).tighten === true && J(st({ mode: 0o40700 }), 1000).tighten === false && J(st({ mode: 0o40700 }), null).ok === true, 'judgeStoredDir: group-writable / group-readable we own ⇒ ok + tighten; 0700 ⇒ ok, nothing to do; no uid known ⇒ the uid cell is not judged'); }
  // CONTROLS: each rule removed in a patched copy turns its row(s) red (the revert table of this round)
  const M2 = mutantCopies('design-kit-r1', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/design-kit.js'), 'utf8');
  const CONTROLS = [
    { tag: 'follow-symlinks', from: 'try { st = fs.lstatSync(dir); } catch { }\n  const v = judgeStoredDir(', to: 'try { st = fs.statSync(dir); } catch { }\n  const v = judgeStoredDir(', rows: ['a PLANTED kit dir that is a SYMLINK (self-written kit.json, foreign helper) ⇒ refused at the door, the helper never runs'] },
    { tag: 'world-writable-ok', from: "if (st.mode & 0o002) return { why: 'its dir is world-writable (chmod 700 it, or remove it)' };", to: 'if (false) return {};', rows: ['a PLANTED kit dir that is WORLD-WRITABLE ⇒ refused at the door, the helper never runs'] },
    { tag: 'stored-sha-off', from: "if (sha(helperBuf) !== f['seed-canvas.mjs'] || sha(payloadBuf) !== f['payload.template.html'] || sha(skillBuf) !== f['SKILL.orig.md']) return", to: 'if (false) return', rows: ['a stored kit whose helper changed by ONE byte ⇒ refused by its sha BEFORE --check (the helper never runs), named'] },
    { tag: 'cache-sha-off', from: "names.every((f) => sha(readOwnFile(path.join(dir, f))) === k.files[f])", to: 'names.every((f) => fs.existsSync(path.join(dir, f)))', rows: ['the CACHED kit is served only while its files match the recorded sha: a swapped helper ⇒ rebuilt through the ladder, the swap never served, the helper never run'] },
    { tag: 'no-prune', from: "const pruned = pruneStoredKits(root, { keep: STORED_KEEP, current: dir, spare: out.rung === 'stored-kit' ? out.donorFrom : null });", to: 'const pruned = [];', rows: [ROWS[ROWS.length - 1].name] },
    { tag: 'skipped-unnamed', from: 'if (skipped.length) parts.push(', to: 'if (false) parts.push(', rows: ['only a NEWER installed binary carries it ⇒ no donor; the newer one NAMED as skipped, with the rule', 'a kit this server stored earlier of a NEWER version (the user downgraded) ⇒ never a donor, NAMED as skipped'] },
    { tag: 'no-npm-rung', from: 'for (const d of packageDirs || []) {', to: 'for (const d of []) {', rows: ["the fleet pod: the image's npm package (older) is a donor — package.json's version, cli.js read as bytes, named as npm"] },
    { tag: 'no-tighten', from: "if (v.ok && v.tighten) { try { fs.chmodSync(dir, 0o700); }", to: 'if (false) { try { fs.chmodSync(dir, 0o700); }', rows: ['a kit dir WE OWN that is group-writable (umask 002 — every kit before this rule) ⇒ tightened to 0700 and served'] },
  ];
  for (const c of CONTROLS) {
    if (SRC.split(c.from).length !== 2) { ok(false, `CONTROL anchor '${c.tag}' is in the module exactly once`); continue; }
    const copy = M2.load('src/server/design-kit.js', SRC.replace(c.from, c.to), c.tag);
    const reds = await judgeLadder(copy, c.rows);
    ok(reds.length === c.rows.length, `CONTROL: a copy with '${c.tag}' is red on its ${c.rows.length} row(s)`, reds.length ? reds.join(' | ') : 'the copy stayed green');
  }
  for (const c of copiesCensus(M2.files, M2.dir, REPO, { minCopies: CONTROLS.length, label: 'design-kit r1 controls: ' })) ok(c.pass, c.name, c.detail);
  // ── 11. VERIFY r2 — the doors r1 left open, each reproduced on the real module before its rule; a patched-copy control per rule ──
  // ① the !force CACHE HIT never judged the RUNNING version's own dir: a symlink / a world-writable dir planted at
  //    data/design-kit/<running>/ with a self-written kit.json was served `cached:true` and `fileFor` handed its helper out;
  // ② every read after a dir's lstat was BY PATH: a symlink ENTRY inside an owned 0700 kit dir was followed to a foreign
  //    helper (the sha beside it was the target's) and EXECUTED — now readOwnFile (O_NOFOLLOW + fstat: a regular file of
  //    our uid) is the one reader of every byte hashed, handed out or executed; ③ a kit root that was a symlink was written
  //    INTO and the helper executed from its target; a root that cannot be written threw EACCES out of build() — ensure()
  //    rejected, the status route never answered; ④ failed records (kit.json ok:false) filled the bound of 8 while real
  //    kits were removed, and a build removed the very dir it had just read its donor from; ⑤ a 1.5 GiB cli.js under a
  //    planted package.json was read whole (Node's 2 GiB cliff the only bound); ⑥ the helper child and the --version
  //    child inherited the server's FULL process.env (VIBESPACE_PASSWORD, the Clerk / Lark secrets, CLAUDE_CODE_OAUTH_TOKEN).
  const mk = (mod, w, running) => mod.create({ dataDir: path.join(w, 'data'), claudeCmd: () => path.join(vdir(w), running), versionsDirs: [vdir(w)], packageDirs: [], log: () => { } });
  const envDumpHelper = (file) => FAKE_HELPER.replace("import fs from 'node:fs';\n", "import fs from 'node:fs';\nfs.writeFileSync(" + JSON.stringify(file) + ", JSON.stringify({ env: process.env, cwd: process.cwd() }) + '\\n', { flag: 'a' });\n");
  const carrierWith = (helperText) => Buffer.concat([junk(400), Buffer.from('export{p as loadDesignCanvasFiles};'), junk(50), frame(FAKE_SKILL), junk(30), frame(helperText), junk(30), frame(payload('own')), junk(400)]);
  const PROBES = { VIBESPACE_PASSWORD: 'hunter2-probe', VIBESPACE_CLERK_SECRET_KEY: 'sk_probe', VIBESPACE_LARK_APP_SECRET: 'lark_probe', CLAUDE_CODE_OAUTH_TOKEN: 'oat-probe', npm_config_probe: '1' };
  const withProbes = async (fn) => { const prev = {}; for (const k of Object.keys(PROBES)) { prev[k] = process.env[k]; process.env[k] = PROBES[k]; } try { return await fn(); } finally { for (const k of Object.keys(PROBES)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } } };
  const R2 = [
    { name: "verify r2: a PLANTED dir at the RUNNING version's own name that is a SYMLINK ⇒ refused by name at the cache hit, never served, never written into, the helper never runs", async run(mod, w) { const m = marker(w); binary(w, '2.1.287', junk(5000)); const elsewhere = path.join(w, 'elsewhere'); plant(elsewhere, { version: '2.1.287', helper: markerHelper(m), pay: payload('planted') }); fs.mkdirSync(kitRoot(w), { recursive: true }); fs.symlinkSync(elsewhere, path.join(kitRoot(w), '2.1.287')); const before = fs.readFileSync(path.join(elsewhere, 'kit.json'), 'utf8'); const kit = mk(mod, w, '2.1.287'); const r = await kit.ensure(); return !r.ok && r.code === 'refused_dir' && /^CLI 2\.1\.287 — the kit directory: .*2\.1\.287 — its dir is a symlink; remove it/.test(r.error || '') && kit.fileFor('seed-canvas.mjs') === null && kit.readKitFile('seed-canvas.mjs') === null && fs.readFileSync(path.join(elsewhere, 'kit.json'), 'utf8') === before && !fs.existsSync(m) ? null : (fs.existsSync(m) ? 'THE HELPER RAN; ' : '') + JSON.stringify({ ok: r.ok, code: r.code, error: r.error, served: kit.fileFor('seed-canvas.mjs'), plantRewritten: fs.readFileSync(path.join(elsewhere, 'kit.json'), 'utf8') !== before }); } },
    { name: "verify r2: a PLANTED dir at the RUNNING version's own name that is WORLD-WRITABLE ⇒ refused by name at the cache hit, never served", async run(mod, w) { binary(w, '2.1.287', junk(5000)); const d = path.join(kitRoot(w), '2.1.287'); plant(d, { version: '2.1.287', helper: FAKE_HELPER, pay: payload('planted') }); fs.chmodSync(d, 0o777); const kit = mk(mod, w, '2.1.287'); const r = await kit.ensure(); return !r.ok && r.code === 'refused_dir' && /the kit directory: .*2\.1\.287 — its dir is world-writable/.test(r.error || '') && kit.fileFor('seed-canvas.mjs') === null ? null : JSON.stringify({ ok: r.ok, code: r.code, error: r.error }); } },
    { name: 'verify r2: a symlink ENTRY (seed-canvas.mjs → a foreign helper) inside a stored dir we own ⇒ refused by name, never followed, the helper never runs', async run(mod, w) { const m = marker(w); binary(w, '2.1.288', junk(5000)); const foreign = path.join(w, 'foreign', 'helper.mjs'); fs.mkdirSync(path.dirname(foreign)); fs.writeFileSync(foreign, markerHelper(m)); const d = path.join(kitRoot(w), '2.1.281'); plant(d, { version: '2.1.281', helper: 'placeholder', pay: payload('stored') }); fs.rmSync(path.join(d, 'seed-canvas.mjs')); fs.symlinkSync(foreign, path.join(d, 'seed-canvas.mjs')); const k = JSON.parse(fs.readFileSync(path.join(d, 'kit.json'), 'utf8')); k.files['seed-canvas.mjs'] = sha(fs.readFileSync(foreign)); fs.writeFileSync(path.join(d, 'kit.json'), JSON.stringify(k)); fs.chmodSync(d, 0o700); fs.chmodSync(kitRoot(w), 0o700); const r = await build(mod, w, '2.1.288'); return !r.ok && !fs.existsSync(m) && /looked at: 2\.1\.281 stored kit — a kit this server stored earlier: seed-canvas\.mjs is a symlink/.test(r.error || '') ? null : (fs.existsSync(m) ? 'THE HELPER RAN; ' : '') + (r.error || 'ok'); } },
    { name: 'verify r2: a kit ROOT that is a SYMLINK ⇒ refused by name, nothing written into its target, the helper never runs', async run(mod, w) { const m = marker(w); binary(w, '2.1.281', carrierWith(markerHelper(m))); const elsewhere = path.join(w, 'elsewhere'); fs.mkdirSync(elsewhere); fs.mkdirSync(path.join(w, 'data')); fs.symlinkSync(elsewhere, kitRoot(w)); const r = await build(mod, w, '2.1.281'); return !r.ok && r.code === 'refused_dir' && /the kit directory: the kit root .* is a symlink — not ours to write into/.test(r.error || '') && fs.readdirSync(elsewhere).length === 0 && !fs.existsSync(m) ? null : (fs.existsSync(m) ? 'THE HELPER RAN; ' : '') + JSON.stringify({ ok: r.ok, error: r.error, target: fs.readdirSync(elsewhere) }); } },
    { name: 'verify r2: a kit root that cannot be written (0500) ⇒ a NAMED refusal, ensure() resolves, the status route answers it', async run(mod, w) { if (process.getuid && process.getuid() === 0) return null; binary(w, '2.1.281', carrierOf('own')); fs.mkdirSync(kitRoot(w), { recursive: true }); fs.chmodSync(kitRoot(w), 0o500); try { const kit = mk(mod, w, '2.1.281'); let r; try { r = await kit.ensure(); } catch (e) { return 'ensure() REJECTED: ' + e.message; } const routes = {}; kit.registerRoutes({ get: (p, fn) => { routes[p] = fn; } }); let body = null; await routes['/api/design-kit/status']({ query: {} }, { json: (x) => { body = x; } }); return r.ok === false && /the kit directory: .*2\.1\.281 could not be created \(EACCES\)/.test(r.error || '') && body && body.ok === false && body.error === r.error ? null : JSON.stringify({ ok: r.ok, error: r.error, body }); } finally { fs.chmodSync(kitRoot(w), 0o700); } } },
    { name: 'verify r2: the helper child gets a MINIMAL env (no VIBESPACE_* / CLAUDE_CODE_OAUTH_TOKEN / npm_*; HOME + cwd = the scratch dir), the --version child the agent-sanitized env', async run(mod, w) { return withProbes(async () => { const dump = path.join(w, 'env.json'); binary(w, '2.1.281', carrierWith(envDumpHelper(dump))); const r = await build(mod, w, '2.1.281'); if (!r.ok) return 'fixture: ' + r.error; const records = fs.readFileSync(dump, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); if (records.length !== 2) return 'fixture: ' + records.length + ' helper records'; const d = records[0]; const leaked = [...new Set(records.flatMap((x) => Object.keys(x.env).filter((k) => k in PROBES || k.startsWith('VIBESPACE_') || k.startsWith('npm_'))))]; const rec = path.join(w, 'claude-rec'); fs.writeFileSync(rec, `#!/bin/sh\nenv > ${JSON.stringify(path.join(w, 'ver-env.txt'))}\necho "2.1.287 (Claude Code)"\n`); fs.chmodSync(rec, 0o755); await mod.create({ dataDir: path.join(w, 'data2'), claudeCmd: () => rec, versionsDirs: [path.join(w, 'nowhere')], packageDirs: [], log: () => { } }).ensure(); const ve = fs.readFileSync(path.join(w, 'ver-env.txt'), 'utf8'); const leakedV = Object.keys(PROBES).filter((k) => ve.includes(k + '=')); return leaked.length === 0 && d.env.PATH && d.env.HOME && d.env.HOME === d.cwd && d.cwd.startsWith(fs.realpathSync(os.tmpdir())) && /vs-design-kit-check-/.test(d.cwd) && leakedV.length === 0 && /^HOME=/m.test(ve) ? null : JSON.stringify({ helperLeaked: leaked, HOME: d.env.HOME, cwd: d.cwd, versionLeaked: leakedV }); }); } },
    { name: 'verify r2: a binary over the bound (a sparse file of 1 GiB + 1 under a versions name) is refused by name, never read', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, '2.1.281', Buffer.alloc(0)); const fd = fs.openSync(path.join(vdir(w), '2.1.281'), 'r+'); fs.ftruncateSync(fd, dkMod.MAX_BINARY + 1); fs.closeSync(fd); const r = await build(mod, w, '2.1.287'); return !r.ok && /looked at: 2\.1\.281 installed — reading the binary: the file is 1\.0 GiB — larger than any Claude Code build \(the 1 GiB bound\); not read/.test(r.error || '') ? null : r.error || 'ok'; } },
    { name: 'verify r2: failed records (kit.json ok:false) never count toward the bound and go first — 8 failed newer dirs + a successful build ⇒ the 8 removed, the kit kept', async run(mod, w) { fs.mkdirSync(kitRoot(w), { recursive: true }); for (let i = 0; i < 8; i++) { const d = path.join(kitRoot(w), `2.1.${300 + i}`); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'kit.json'), JSON.stringify({ ok: false, version: `2.1.${300 + i}`, error: 'x' })); } binary(w, '2.1.281', carrierOf('281')); const r = await build(mod, w, '2.1.281'); const left = fs.readdirSync(kitRoot(w)); return r.ok && Array.isArray(r.pruned) && r.pruned.length === 8 && left.length === 1 && left[0] === '2.1.281' ? null : JSON.stringify({ ok: r.ok, pruned: r.pruned, left }); } },
    { name: 'verify r2: the dir a build read its donor from is spared by that build — nine kit-less versions built from the stored 2.1.281 leave the newest 8 copies + the donor dir (donorFrom stays readable)', async run(mod, w) { await storedEarlier(mod, w, '2.1.281', '281'); let r = null; for (let i = 0; i < 9; i++) { const v = `2.1.${290 + i}`; binary(w, v, junk(5000)); r = await build(mod, w, v); if (!r.ok) return 'fixture: ' + r.error; } const left = fs.readdirSync(kitRoot(w)).sort(dkMod.compareVersions); return r.rung === 'stored-kit' && r.donorFrom === path.join(kitRoot(w), '2.1.281') && fs.existsSync(path.join(r.donorFrom, 'seed-canvas.mjs')) && left.length === STORED_KEEP + 1 && left[0] === '2.1.281' && left[left.length - 1] === '2.1.298' && (r.pruned || []).includes('2.1.290') ? null : JSON.stringify({ rung: r.rung, donorFrom: r.donorFrom, left, pruned: r.pruned }); } },
    { name: 'verify r2: the module asks the CLI for --version and nothing else (a recorder CLI on the path logs every exec)', async run(mod, w) { const logf = path.join(w, 'argv.log'); const rec = path.join(w, 'claude-rec'); fs.writeFileSync(rec, `#!/bin/sh\nprintf '%s\\n' "argv: $*" >> ${JSON.stringify(logf)}\nif [ "$1" = "--version" ] && [ $# -eq 1 ]; then echo "2.1.287 (Claude Code)"; exit 0; fi\necho refused >&2; exit 97\n`); fs.chmodSync(rec, 0o755); const r = await mod.create({ dataDir: path.join(w, 'data'), claudeCmd: () => rec, versionsDirs: [path.join(w, 'nowhere')], packageDirs: [], log: () => { } }).ensure(); const lines = fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8').trim().split('\n') : []; return r.version === '2.1.287' && lines.length === 1 && lines[0] === 'argv: --version' ? null : JSON.stringify({ version: r.version, lines }); } },
  ];
  async function judgeR2(mod, names = null) {
    const reds = [];
    for (const row of R2) {
      if (names && !names.includes(row.name)) continue;
      const w = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-r2-'));
      try { const red = await row.run(mod, w); if (red) reds.push(`${row.name}: ${red}`); } catch (e) { reds.push(`${row.name}: threw ${e.message}`); } finally { fs.rmSync(w, { recursive: true, force: true }); }
    }
    return reds;
  }
  const r2Reds = await judgeR2(dkMod);
  for (const row of R2) ok(!r2Reds.some((r) => r.startsWith(row.name + ':')), `r2 table: ${row.name}`, r2Reds.find((r) => r.startsWith(row.name + ':')));
  // the PURE pins: readOwnFile and ownStoredRoot, every cell
  { const w = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-own-')); const whyOf = (p) => { try { dkMod.readOwnFile(p); return 'READ'; } catch (e) { return e.kitWhy || e.code; } };
    try {
      fs.writeFileSync(path.join(w, 'f'), 'bytes', { mode: 0o600 }); fs.symlinkSync(path.join(w, 'f'), path.join(w, 'l')); fs.mkdirSync(path.join(w, 'd')); fs.writeFileSync(path.join(w, 'ow'), 'x'); fs.chmodSync(path.join(w, 'ow'), 0o666); fs.writeFileSync(path.join(w, 'gw'), 'g'); fs.chmodSync(path.join(w, 'gw'), 0o664);
      ok(dkMod.readOwnFile(path.join(w, 'f')).toString() === 'bytes' && whyOf(path.join(w, 'l')) === 'l is a symlink' && whyOf(path.join(w, 'd')) === 'd is not a regular file' && whyOf(path.join(w, 'ow')) === 'ow is world-writable' && whyOf(path.join(w, 'missing')) === 'ENOENT', 'readOwnFile: a regular 0600 file of ours reads; a symlink / a dir / a world-writable file / a missing file refused by name');
      ok(dkMod.readOwnFile(path.join(w, 'gw')).toString() === 'g' && (fs.statSync(path.join(w, 'gw')).mode & 0o777) === 0o600, 'readOwnFile: a group-writable file we own (umask 002) is tightened to 0600 on the fd and read');
      fs.symlinkSync(path.join(w, 'd'), path.join(w, 'rootlink')); fs.mkdirSync(path.join(w, 'loose')); fs.chmodSync(path.join(w, 'loose'), 0o775);
      ok(dkMod.ownStoredRoot(path.join(w, 'new')).ok === true && (fs.statSync(path.join(w, 'new')).mode & 0o777) === 0o700 && /is a symlink — not ours to write into/.test(dkMod.ownStoredRoot(path.join(w, 'rootlink')).why) && /is not a directory/.test(dkMod.ownStoredRoot(path.join(w, 'f')).why) && dkMod.ownStoredRoot(path.join(w, 'loose')).ok === true && (fs.statSync(path.join(w, 'loose')).mode & 0o777) === 0o700, 'ownStoredRoot: a missing root is created 0700; a symlink / a file refused by name; a loose root we own is tightened');
    } finally { fs.rmSync(w, { recursive: true, force: true }); } }
  // CONTROLS (the revert table of this round): each rule removed in a patched copy turns its row red
  const M3 = mutantCopies('design-kit-r2', REPO);
  const SRC2 = fs.readFileSync(path.join(REPO, 'src/server/design-kit.js'), 'utf8');
  const CONTROLS2 = [
    { tag: 'cache-door-unjudged', edits: [["if (!dv.ok && dv.why !== 'its dir is missing') { const r = refused('kit-dir'", "if (false) { const r = refused('kit-dir'"]], rows: [R2[0].name, R2[1].name] },
    { tag: 'follow-entry-symlinks', edits: [['fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)', 'fs.constants.O_RDONLY']], rows: [R2[2].name] },
    { tag: 'root-unjudged', edits: [['if (st.isSymbolicLink()) return { why: `the kit root ${root} is a symlink — not ours to write into (remove it)` };', 'if (false) return {};']], rows: [R2[3].name] },
    { tag: 'mkdir-unnamed', edits: [["try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700); } catch (e) { throw new Error(refusalLine(version, 'kit-dir', `${dir} could not be created (${e.code || e.message})`)); }", ''], ['const out = { ok: false, version, binary: bin, dir, source: null, rung: null, donorVersion: null, own: null, files: {}, createdAt: Date.now() };', 'fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); const out = { ok: false, version, binary: bin, dir, source: null, rung: null, donorVersion: null, own: null, files: {}, createdAt: Date.now() };'], ["inflight = build(force).catch((e) => ({ ok: false, version: null, error: refusalLine('?', 'build', e.message), rung: 'build', createdAt: Date.now() })).then(", 'inflight = build(force).then(']], rows: [R2[4].name] },
    { tag: 'helper-env-leak', edits: [['{ cwd: tmp, env: helperEnv(tmp) });\n      if (seed.code !== 0)', '{ cwd: tmp });\n      if (seed.code !== 0)']], rows: [R2[5].name] },
    { tag: 'version-env-leak', edits: [['{ timeout: 8000, env: agentEnv(process.env) }', '{ timeout: 8000 }']], rows: [R2[5].name] },
    { tag: 'binary-unbounded', edits: [['if (size > MAX_BINARY) return refuse(', 'if (false) return refuse(']], rows: [R2[6].name] },
    { tag: 'prune-counts-failed', edits: [['(kitOk(dir) ? kits : failed).push(n);', 'kits.push(n);']], rows: [R2[7].name] },
    { tag: 'donor-pruned', edits: [["spare: out.rung === 'stored-kit' ? out.donorFrom : null", 'spare: null']], rows: [R2[8].name] },
    { tag: 'version-plus', edits: [["execFile(bin, ['--version'], { timeout: 8000, env: agentEnv(process.env) }", "execFile(bin, ['--version', '--verbose'], { timeout: 8000, env: agentEnv(process.env) }"]], rows: [R2[9].name] },
  ];
  for (const c of CONTROLS2) {
    let src = SRC2, bad = null;
    for (const [from, to] of c.edits) { if (src.split(from).length !== 2) { bad = from.slice(0, 50); break; } src = src.replace(from, to); }
    if (bad) { ok(false, `CONTROL anchor '${c.tag}' is in the module exactly once`, bad); continue; }
    const copy = M3.load('src/server/design-kit.js', src, c.tag);
    const reds = await judgeR2(copy, c.rows);
    ok(reds.length === c.rows.length, `CONTROL r2: a copy with '${c.tag}' is red on its ${c.rows.length} row(s)`, reds.length ? reds.join(' | ') : 'the copy stayed green');
  }
  for (const c of copiesCensus(M3.files, M3.dir, REPO, { minCopies: CONTROLS2.length, label: 'design-kit r2 controls: ' })) ok(c.pass, c.name, c.detail);
  // ── 12. VERIFY r3 — what r2 added, attacked; each reproduced on the real module before its rule; a patched-copy control per rule ──
  // ② the --check ran the helper BY PATH after the hash: a same-uid writer swapping the kit dir's seed-canvas.mjs between
  //    its write and the --check had ITS helper executed while the record named the original — validateKit now writes the
  //    hashed BUFFERS into its own 0700 scratch and runs them from there (every argv path under the scratch);
  // ① a second name (a hard link; the file itself) rewritten after the build was HANDED OUT against a record whose sha256
  //    said otherwise (the next ensure would rebuild; the hand-out in between never asked) — readKitFile re-hashes;
  // ⑥ the 1 GiB bound was a stat BY PATH before the read: a binary that grew past it after that stat was read WHOLE by
  //    the zstd rung (1 GiB + 1, RSS 1078 MB) — readBounded reads through fstat on the fd it reads, cut to that size;
  // ③/⑦ which process runs what: the build's two helper spawns are pinned (argv shape, cwd = HOME = TMPDIR = the scratch,
  //    the env's keys) and the module's spawn sites are a static census (execFile ×2: the CLI's --version, the helper).
  const R3 = [
    { name: 'verify r3: a same-uid writer swaps seed-canvas.mjs between its write and the --check ⇒ the hashed bytes run (from the scratch), the swap never executes, the next ensure rebuilds', async run(mod, w) { const m = marker(w); binary(w, '2.1.281', carrierOf('own')); const realRename = fs.renameSync; let swapped = null; fs.renameSync = function (from, to) { const r = realRename.call(fs, from, to); if (String(to).endsWith('seed-canvas.mjs') && !swapped) { fs.writeFileSync(to, markerHelper(m)); swapped = to; } return r; }; let kit, r; try { kit = mk(mod, w, '2.1.281'); r = await kit.ensure(); } finally { fs.renameSync = realRename; } const r2 = await kit.ensure(); return r.ok && swapped && r.files['seed-canvas.mjs'] === sha(FAKE_HELPER) && !fs.existsSync(m) && r2.cached !== true && r2.ok ? null : (fs.existsSync(m) ? 'THE SWAPPED HELPER RAN; ' : '') + JSON.stringify({ ok: r.ok, swapped: !!swapped, hashedIsOriginal: r.files && r.files['seed-canvas.mjs'] === sha(FAKE_HELPER), next: { cached: r2.cached, ok: r2.ok } }); } },
    { name: 'verify r3: a kit file rewritten after the build — in place, or through a second hard-link name — is not handed out (readKitFile re-hashes against the record; fileFor still names it)', async run(mod, w) { binary(w, '2.1.281', carrierOf('own')); const kit = mk(mod, w, '2.1.281'); const r = await kit.ensure(); if (!r.ok) return 'fixture: ' + r.error; const before = kit.readKitFile('seed-canvas.mjs'); fs.writeFileSync(path.join(r.dir, 'seed-canvas.mjs'), '// rewritten in place\n'); const other = path.join(w, 'other-name.html'); fs.linkSync(path.join(r.dir, 'payload.template.html'), other); fs.writeFileSync(other, '<!doctype html>rewritten through the other name'); return before && sha(before) === r.files['seed-canvas.mjs'] && kit.fileFor('seed-canvas.mjs') && kit.readKitFile('seed-canvas.mjs') === null && kit.readKitFile('payload.template.html') === null && kit.readKitFile('SKILL.md') !== null ? null : JSON.stringify({ before: !!before, inPlace: kit.readKitFile('seed-canvas.mjs') !== null, otherName: kit.readKitFile('payload.template.html') !== null, untouched: kit.readKitFile('SKILL.md') !== null }); } },
    { name: 'verify r3: a binary that grows PAST the 1 GiB bound after the pre-read stat is refused by name from the fd it is read on — never read whole', async run(mod, w) { binary(w, '2.1.287', junk(5000)); binary(w, '2.1.281', carrierOf('281')); const target = path.join(vdir(w), '2.1.281'); const realStat = fs.statSync, realReadFile = fs.promises.readFile; let calls = 0, grown = false, readFileCalls = 0; fs.statSync = function (p, ...a) { const st = realStat.call(fs, p, ...a); if (path.resolve(String(p)) === path.resolve(target) && ++calls === 2 && !grown) { grown = true; const fd = fs.openSync(target, 'r+'); fs.ftruncateSync(fd, dkMod.MAX_BINARY + 1); fs.closeSync(fd); } return st; }; fs.promises.readFile = async function (p, ...a) { if (path.resolve(String(p)) === path.resolve(target)) readFileCalls++; return realReadFile.call(fs.promises, p, ...a); }; let r; try { r = await build(mod, w, '2.1.287'); } finally { fs.statSync = realStat; fs.promises.readFile = realReadFile; } return grown && !r.ok && readFileCalls === 0 && /looked at: 2\.1\.281 installed — the binary's zstd frames: the file is 1\.0 GiB — larger than any Claude Code build \(the 1 GiB bound\); not read/.test(r.error || '') ? null : JSON.stringify({ grown, ok: r.ok, readFileCalls, error: (r.error || '').slice(0, 200) }); } },
    { name: "verify r3: the build's two helper spawns are exactly the seed and the --check, every argv path under the scratch (cwd = HOME = TMPDIR), the env's keys the minimal set", async run(mod, w) { const dump = path.join(w, 'argv.json'); binary(w, '2.1.281', carrierWith(FAKE_HELPER.replace("import fs from 'node:fs';\n", "import fs from 'node:fs';\nfs.writeFileSync(" + JSON.stringify(dump) + ", JSON.stringify({ argv: process.argv.slice(1), cwd: process.cwd(), env: process.env }) + '\\n', { flag: 'a' });\n"))); const r = await build(mod, w, '2.1.281'); if (!r.ok) return 'fixture: ' + r.error; const recs = fs.readFileSync(dump, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); const cwd = recs[0] && recs[0].cwd; const shape = recs.map((x) => x.argv.map((a) => a.startsWith(cwd + '/') ? '<scratch>/' + path.basename(a) : a).join(' ')); const want = ['<scratch>/seed-canvas.mjs --template <scratch>/payload.template.html --out kit-check-card.html --title Kit Check Card --artboard Main.dc.html', '<scratch>/seed-canvas.mjs --check kit-check-card.html']; const envOk = recs.every((x) => Object.keys(x.env).every((k) => ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ'].includes(k)) && x.env.HOME === x.cwd && x.env.TMPDIR === x.cwd && x.cwd === cwd); const absOk = recs.every((x) => x.argv.filter((a) => a.startsWith('/')).every((a) => a.startsWith(cwd + '/'))); return JSON.stringify(shape) === JSON.stringify(want) && envOk && absOk && /vs-design-kit-check-/.test(cwd) ? null : JSON.stringify({ shape, envOk, absOk, cwd }); } },
  ];
  async function judgeR3(mod, names = null) {
    const reds = [];
    for (const row of R3) {
      if (names && !names.includes(row.name)) continue;
      const w = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-r3-'));
      try { const red = await row.run(mod, w); if (red) reds.push(`${row.name}: ${red}`); } catch (e) { reds.push(`${row.name}: threw ${e.message}`); } finally { fs.rmSync(w, { recursive: true, force: true }); }
    }
    return reds;
  }
  const r3Reds = await judgeR3(dkMod);
  for (const row of R3) ok(!r3Reds.some((r) => r.startsWith(row.name + ':')), `r3 table: ${row.name}`, r3Reds.find((r) => r.startsWith(row.name + ':')));
  // the PURE cells of readBounded: exact bytes under the bound; over it a named EFBIG refusal before any read
  { const w = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-rb-'));
    try {
      const bytes = Buffer.from('z'.repeat(3 * 1024 * 1024)); fs.writeFileSync(path.join(w, 'f'), bytes);
      const got = await dkMod.readBounded(path.join(w, 'f'));
      let why = null; try { await dkMod.readBounded(path.join(w, 'f'), 1024 * 1024); } catch (e) { why = `${e.code}: ${e.message}`; }
      ok(got.length === bytes.length && got.equals(bytes) && why === 'EFBIG: the file is 0.0 GiB — larger than any Claude Code build (the 0.0009765625 GiB bound); not read', 'readBounded: a 3 MiB file reads whole under the bound; over a 1 MiB bound it is refused EFBIG by name', why || String(got.length));
    } finally { fs.rmSync(w, { recursive: true, force: true }); } }
  // the spawn CENSUS (⑦): every child this module starts is one of two execFile sites — the CLI's `--version` (the recorder leg pins
  // the argv) and `run(process.execPath, [helper, …])` (the row above pins both argv shapes); nothing else from child_process
  ok((SRC2.match(/\bexecFile\(/g) || []).length === 2 && (SRC2.match(/require\('child_process'\)/g) || []).length === 1 && SRC2.includes("const { execFile } = require('child_process');") && !/\b(spawn|spawnSync|execSync|execFileSync|fork)\s*\(/.test(SRC2) && (SRC2.match(/\brun\(process\.execPath, \[helper, /g) || []).length === 2 && (SRC2.match(/\brun\(/g) || []).length === 2, 'spawn census: child_process is imported once as { execFile }, called at two sites (the CLI --version, the helper runner), the runner called twice with [helper, …] and nowhere else');
  ok(!/child_process|spawn\(|execFile\(/.test(fs.readFileSync(path.join(REPO, 'data/bin/vibespace-page'), 'utf8')), 'spawn census: vibespace-page starts no child (the agent runs the helper itself, from its own process and env)');
  // ⑧ the popover words on a 375 px phone: the panel clamps to the container and the kit line WRAPS (no nowrap, no max-height
  // on the dropdown), so the cost of a long refusal is lines, not clipping — a plain-text bound keeps it a paragraph
  { const KEYS3 = ['Design kit ready — taken from CLI {donor}; this CLI {v} does not ship it', 'Design kit ready — taken from CLI {donor}; this CLI {v} could not give its own', 'Claude Code {v} does not ship the design canvas kit, and no other version on this machine has one (the last that did: {last}). VibeSpace keeps looking by itself — press Retry any time; the CLI you run stays as it is, nothing is downgraded. Or use /design in a terminal session, which works through claude.ai.'];
    const subst = (s) => s.replace('{donor}', '2.1.281').replace('{v}', '2.1.287').replace('{last}', '2.1.281');
    const lens = { en: KEYS3.map((k) => subst(k).length) };
    for (const lang of ['zh', 'ja']) { const dict = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf8'); lens[lang] = KEYS3.map((k) => { const m = new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "': '([^']*)'").exec(dict); return m ? subst(m[1]).length : -1; }); }
    const BOUND = { en: 320, zh: 160, ja: 230 };
    ok(Object.entries(lens).every(([l, a]) => a.every((n) => n > 0 && n <= BOUND[l])), `popover words: every line within its plain-text bound (en ≤ ${BOUND.en}, zh ≤ ${BOUND.zh}, ja ≤ ${BOUND.ja} chars with the placeholders filled — ≈ 6 / 6 / 8 wrapped lines at 11 px in the 300 px panel)`, JSON.stringify(lens));
    const css = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
    ok(/\.chat-design-kit \{[^}]*\}/.test(css) && !/\.chat-design-kit \{[^}]*nowrap/.test(css) && /\.chat-status-dropdown \{[^}]*\}/.test(css) && !/\.chat-status-dropdown \{[^}]*max-height/.test(css), 'popover words: the kit line wraps (no nowrap) and the dropdown has no max-height (a long refusal costs lines, never a clipped line)'); }
  // CONTROLS (the revert table of this round): each rule removed in a patched copy turns its row red
  const M4 = mutantCopies('design-kit-r3', REPO);
  const CONTROLS3 = [
    { tag: 'exec-from-kit-dir', edits: [['async function validateKit({ helperBuf, payloadBuf }) {', 'async function validateKit({ helperBuf, payloadBuf, dir }) {'], ["const helper = path.join(tmp, 'seed-canvas.mjs'), template = path.join(tmp, 'payload.template.html');", "const helper = path.join(dir, 'seed-canvas.mjs'), template = path.join(dir, 'payload.template.html');"], ['      fs.writeFileSync(helper, helperBuf, { mode: 0o600 });\n      fs.writeFileSync(template, payloadBuf, { mode: 0o600 });\n', ''], ['const bad = await validateKit({ helperBuf, payloadBuf });', 'const bad = await validateKit({ helperBuf, payloadBuf, dir });']], rows: [R3[0].name, R3[3].name] },
    { tag: 'handout-unchecked', edits: [['if (sha(buf) !== (last.files || {})[name]) {', 'if (false) {']], rows: [R3[1].name] },
    { tag: 'unbounded-read', edits: [['const d = await readBounded(file);', 'const d = await fs.promises.readFile(file);']], rows: [R3[2].name] },
    { tag: 'helper-argv-plus', edits: [["[helper, '--check', 'kit-check-card.html']", "[helper, '--check', 'kit-check-card.html', '--force']"]], rows: [R3[3].name] },
  ];
  for (const c of CONTROLS3) {
    let src = SRC2, bad = null;
    for (const [from, to] of c.edits) { if (src.split(from).length !== 2) { bad = from.slice(0, 50); break; } src = src.replace(from, to); }
    if (bad) { ok(false, `CONTROL anchor '${c.tag}' is in the module exactly once`, bad); continue; }
    const copy = M4.load('src/server/design-kit.js', src, c.tag);
    const reds = await judgeR3(copy, c.rows);
    ok(reds.length === c.rows.length, `CONTROL r3: a copy with '${c.tag}' is red on its ${c.rows.length} row(s)`, reds.length ? reds.join(' | ') : 'the copy stayed green');
  }
  for (const c of copiesCensus(M4.files, M4.dir, REPO, { minCopies: CONTROLS3.length, label: 'design-kit r3 controls: ' })) ok(c.pass, c.name, c.detail);
} else console.log('  SKIP: this Node has no zlib zstd — the donor table over the ladder is not exercised');

// ── 1-3. against the installed CLI ──
// real-cli-env: the installed claude is only asked `--version` (by the kit module) and read as bytes — no turn, no server, nothing a key could bill (B-5f0b audit)
let bin = null;
try { bin = execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim(); } catch { }
if (!bin) {
  console.log('  SKIP: no `claude` binary on PATH — extraction/validation/parity not exercised here');
} else {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-'));
  const kit = create({ dataDir, claudeCmd: () => bin, log: () => { } });
  const t0 = Date.now();
  const r = await kit.ensure();
  // CLI ≥2.1.257 repacked the binary (bun chunks; the frontmatter skill text
  // is GONE — verified byte-probe 2026-09-01): the kit degrades honestly
  // ("明确不可用") and its adaptation is tracked work, but this suite must not
  // block unrelated pushes on a CLI auto-update. Evidence-carrying SKIP —
  // never a silent pass (the check-the-ci-mirror law).
  // lane design-kit-287: a CLI that ships no kit (2.1.287) gets one from an older
  // installed version; with none on the machine the refusal is the environment,
  // not this code — an evidence-carrying SKIP naming it, never a silent pass
  const layoutChanged = !r.ok && (/layout changed/.test(String(r.error || '')) || r.code === 'not_shipped');
  if (layoutChanged) {
    console.log(`  SKIP: CLI ${r.version} gives no kit and no other version on this machine has one (${String(r.error).slice(0, 160)}) — extraction legs not exercised`);
  } else {
    ok(r.ok === true, `kit ensure ok for CLI ${r.version} (${r.source}, ${Date.now() - t0}ms)`, r.error);
  }
  if (r.ok) {
    for (const f of ['seed-canvas.mjs', 'payload.template.html', 'SKILL.md', 'SKILL.orig.md']) ok(fs.existsSync(path.join(r.dir, f)), `kit file present: ${f}`);
    const orig = fs.readFileSync(path.join(r.dir, 'SKILL.orig.md'), 'utf8');
    ok(/^---\nname: design\n/.test(orig) && orig.includes('## Workflow') && orig.includes('seed-canvas.mjs'), 'extracted skill text is the design skill (frontmatter + workflow + helper reference)');
    const adapted = fs.readFileSync(path.join(r.dir, 'SKILL.md'), 'utf8');
    ok(adapted.includes('vibespace-page publish') && adapted.includes('VibeSpace variant'), 'SKILL.md is the VibeSpace adaptation');
    const payload = fs.readFileSync(path.join(r.dir, 'payload.template.html'));
    ok(payload.length > 1_000_000 && payload.includes('id="appifact-doc"') && /<\/html>\s*$/.test(payload.subarray(-20).toString()), `payload is the whole editor page (${payload.length} bytes, ends with </html>)`);
    // ② usable: the kit's own helper seeds + checks a sample (the module did this too; do it again here, visibly)
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-seed-'));
    fs.writeFileSync(path.join(work, 'Main.dc.html'), '<!doctype html><html><head><script src="./support.js"></script></head><body style="width:300px;height:100px">Hello</body></html>');
    let seedOut = '', chkOut = '';
    try {
      seedOut = execFileSync(process.execPath, [path.join(r.dir, 'seed-canvas.mjs'), '--template', path.join(r.dir, 'payload.template.html'), '--out', 'hello-card.html', '--title', 'Hello Card', '--artboard', 'Main.dc.html'], { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      chkOut = execFileSync(process.execPath, [path.join(r.dir, 'seed-canvas.mjs'), '--check', 'hello-card.html'], { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { chkOut = String(e.stderr || e.message); }
    ok(/^ok:/m.test(chkOut) && fs.existsSync(path.join(work, 'hello-card.html')), 'the kit seeds a sample artboard and its own --check says ok', (seedOut + chkOut).slice(0, 200));
    // ③ parity with the CLI's own extraction when present
    const cli = kit.findCliExtractedKit(r.version);
    if (cli && cli.version === r.version) {
      ok(sha(fs.readFileSync(path.join(cli.dir, 'seed-canvas.mjs'))) === sha(fs.readFileSync(path.join(r.dir, 'seed-canvas.mjs'))), 'PARITY: helper bytes == the CLI\'s own extraction');
      ok(sha(fs.readFileSync(path.join(cli.dir, 'payload.template.html'))) === sha(payload), 'PARITY: payload bytes == the CLI\'s own extraction');
      // and the BINARY path must agree too (the fallback users without a /tmp extraction get)
      const { findOffsets, readTemplateLiteral, extractPayload, HELPER_ANCHOR } = kit._internals;
      const real = fs.realpathSync(bin);
      const offs = await findOffsets(real, [HELPER_ANCHOR]); // Map keyed by the SAME Buffer instance
      const h = offs.has(HELPER_ANCHOR) ? await readTemplateLiteral(real, offs.get(HELPER_ANCHOR) + 1) : null;
      const p = await extractPayload(real);
      ok(h && sha(Buffer.from(h, 'utf8')) === sha(fs.readFileSync(path.join(cli.dir, 'seed-canvas.mjs'))), 'PARITY: binary-extracted helper == the CLI\'s own extraction');
      ok(p && sha(p) === sha(fs.readFileSync(path.join(cli.dir, 'payload.template.html'))), 'PARITY: binary-extracted payload == the CLI\'s own extraction');
    } else {
      console.log('  SKIP: no CLI-extracted kit under /tmp for this version — parity not measured (binary path exercised by ensure only if it was the source)');
    }
    // cache: second ensure is instant and says cached
    const r2 = await kit.ensure();
    ok(r2.cached === true && r2.dir === r.dir, 'second ensure returns the cached kit');
    fs.rmSync(work, { recursive: true, force: true });
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// wiring pins
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
ok(read('server.js').includes("design-kit.js').create") && read('server.js').includes('designKit.registerRoutes(app)'), 'server.js creates the kit + registers /api/design-kit/status');
ok(read('src/agent-routes.js').includes("'/api/agent/design-kit'") && read('src/agent-routes.js').includes("'/api/agent/design-kit/file/:name'"), 'agent routes serve kit info + files (remote hosts mirror the kit)');
const cli = read('data/bin/vibespace-page');
ok(cli.includes("verb === 'kit'") && cli.includes("verb === 'publish'") && cli.includes('/api/agent/pages/publish'), 'vibespace-page CLI has kit + publish verbs');
try { fs.accessSync(path.join(REPO, 'data/bin/vibespace-page'), fs.constants.X_OK); ok(true, 'vibespace-page is executable'); } catch { ok(false, 'vibespace-page is executable'); }
ok(read('src/hosts.js').includes("'vibespace-page'"), 'vibespace-page ships to remote hosts (AGENT_TOOLS)');
// lane design-kit-287: the popover's three new lines + the routes' donor fields
{
  const bar = read('src/lib/chat-status-bar.js');
  const KEYS = ['Design kit ready — taken from CLI {donor}; this CLI {v} does not ship it', 'Design kit ready — taken from CLI {donor}; this CLI {v} could not give its own', 'Claude Code {v} does not ship the design canvas kit, and no other version on this machine has one (the last that did: {last}). VibeSpace keeps looking by itself — press Retry any time; the CLI you run stays as it is, nothing is downgraded. Or use /design in a terminal session, which works through claude.ai.'];
  ok(KEYS.every((k) => bar.includes(`t('${k}'`)) && /k\.donor\s*\?/.test(bar) && /k\.ownShipped === false/.test(bar) && /k\.code === 'not_shipped'/.test(bar) && /kitLine\.title = \(k\.ok \? k\.source : k\.error\)/.test(bar), 'popover: the donor line (two wordings by ownShipped), the not_shipped sentence and the record as tooltip are wired');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const esc = (k) => "'" + k.replace(/'/g, "\\'") + "':";
  ok(KEYS.every((k) => zh.includes(esc(k)) && ja.includes(esc(k))), 'the three new lines have zh + ja entries');
  ok(/donor: r\.donorVersion \|\| null, ownShipped: r\.own \? r\.own\.shipped : null, code: r\.code \|\| null, lastShipped: r\.lastShipped \|\| null/.test(read('src/server/design-kit.js')), '/api/design-kit/status answers donor / ownShipped / code / lastShipped');
  ok(/donor: k\.donorVersion \|\| null, code: k\.code \|\| null/.test(read('src/agent-routes.js')), '/api/agent/design-kit answers donor / code (vibespace-page kit prints the source, which names the donor)');
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
