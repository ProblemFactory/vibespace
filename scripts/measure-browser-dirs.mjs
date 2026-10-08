#!/usr/bin/env node
// lane browser-resource-care (B-afeb): WHERE every browser directory kind lands — kind → mount (tmpfs or not) → count →
// size. READ-ONLY: findmnt / statfs / du only; never touches a running browser. `--data <dir>` (default <repo>/data);
// `du` runs on /tmp kinds and on at most --max (3) dirs per data/ kind (data/ may be a network mount).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(arg('--data', path.join(ROOT, 'data')));
const MAX = Number(arg('--max', 3)) || 3;
const TMP = arg('--tmp', '/tmp');
const HOME = path.resolve(arg('--home', os.homedir()));
const fstype = (p) => { try { return execFileSync('findmnt', ['-n', '-o', 'FSTYPE', '-T', p], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return '?'; } };
const du = (ps) => { if (!ps.length) return 0; try { return String(execFileSync('du', ['-s', '-B1', '-c', '--', ...ps], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 << 20 })).trim().split('\n').pop().split(/\s+/)[0] * 1; } catch (e) { const o = String((e && e.stdout) || '').trim().split('\n').pop(); return Number((o || '').split(/\s+/)[0]) || null; } };
const gb = (b) => (b === null ? '?' : (b / 2 ** 30).toFixed(2) + ' GB');
const ls = (dir, re) => { try { return fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n)); } catch { return []; } };
let reg = {}; try { reg = JSON.parse(fs.readFileSync(path.join(DATA, 'browser-profiles.json'), 'utf8')); } catch { reg = {}; }
const named = (reg.profiles || []).map((p) => p && p.dir).filter((d) => typeof d === 'string' && d.startsWith('/'));
const rows = [
  ['keeper named profiles (registry dir)', named, false],
  ['keeper scratch / kept (data/browser-profiles/<key>)', ls(path.join(DATA, 'browser-profiles'), /./), false],
  ['daemon TMPDIR, from this lane (data/browser-env/tmp)', [path.join(DATA, 'browser-env', 'tmp')].filter((d) => fs.existsSync(d)), false],
  ['CloakBrowser cache (data/…/cloak-cache)', ls(path.join(DATA, 'browser-builds'), /^cloak-cache$/), false],
  ['agent-browser home (~/.agent-browser)', [path.join(HOME, '.agent-browser')].filter((d) => fs.existsSync(d)), false, HOME],
  ['ephemeral Chrome profiles (TMPDIR/agent-browser-chrome-*)', ls(TMP, /^agent-browser-chrome-/), true],
  ['daemon Xvfb auth (TMPDIR/agent-browser-xauth-*)', ls(TMP, /^agent-browser-xauth-/), true],
  ["an agent's own CDP profiles (/tmp/cdp-prof-*)", ls(TMP, /^cdp-prof-/), true],
  ['Chrome singleton dirs (/tmp/com.google.Chrome.*, org.chromium.Chromium.*)', ls(TMP, /^\.?(com\.google\.Chrome|org\.chromium\.Chromium)\./), true],
];
console.log(`kind | mount | n | size   (data=${DATA}, tmp=${TMP}, home=${HOME})`);
for (const [kind, dirs, all, where] of rows) {
  const mount = dirs.length ? [...new Set(dirs.slice(0, 5).map(fstype))].join('+') : fstype(where || (all ? TMP : DATA));
  const sized = all ? dirs : dirs.slice(0, MAX);
  const size = sized.length ? du(sized) : 0;
  console.log(`${kind} | ${mount} | ${dirs.length} | ${gb(size)}${sized.length < dirs.length ? ` (first ${sized.length})` : ''}`);
}
