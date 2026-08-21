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

// ── 1-3. against the installed CLI ──
let bin = null;
try { bin = execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim(); } catch { }
if (!bin) {
  console.log('  SKIP: no `claude` binary on PATH — extraction/validation/parity not exercised here');
} else {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-design-kit-'));
  const kit = create({ dataDir, claudeCmd: () => bin, log: () => { } });
  const t0 = Date.now();
  const r = await kit.ensure();
  ok(r.ok === true, `kit ensure ok for CLI ${r.version} (${r.source}, ${Date.now() - t0}ms)`, r.error);
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
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
