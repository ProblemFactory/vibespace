#!/usr/bin/env node
// "Link to something on THIS instance" — one helper, every surface (2.367.3,
// owner: "我给vibespace开了frp反代，但是所有地址还是继续用的本机主机名 …
// 无论是活跃转发的地方的path挂载，还是本对话design chip里的artifact").
//
// The server already resolved it (instance-url.js: mapping > agentd.publicUrl
// > the asking request's Host), but every CLIENT surface built its own link by
// gluing location.origin onto a path — so a mapped instance still handed out
// this box's LAN hostname everywhere. utils.absUrl is now the single joiner
// and it prefers the instance's public address; the design row additionally
// prefers the server's own absolute URL over re-joining a path.
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── 1. the helper itself (behavioral, against the real source) ──
{
  const src = read('src/lib/utils.js');
  const m = src.slice(src.indexOf('let _instanceUrl = null;'), src.indexOf('export function copyText'));
  const mod = m.replace(/export function/g, 'function');
  const mk = (origin) => {
    const ctx = { location: { origin } };
    // eslint-disable-next-line no-new-func
    const f = new Function('location', mod + '\nreturn { setInstanceUrl, absUrl, getInstanceUrl };');
    return f(ctx.location);
  };
  let h = mk('http://box.lan:3456');
  ok('with no mapping, a path joins the browser origin (the honest fallback)', h.absUrl('/p/pgx') === 'http://box.lan:3456/p/pgx', h.absUrl('/p/pgx'));
  h.setInstanceUrl('https://mine.relay.example/');
  ok('THE BUG: once mapped, the SAME path uses the public address', h.absUrl('/p/pgx') === 'https://mine.relay.example/p/pgx', h.absUrl('/p/pgx'));
  ok('a trailing slash on the mapping never doubles', !h.absUrl('/svc/app/').includes('//svc'), h.absUrl('/svc/app/'));
  ok('an already-absolute URL passes through untouched (the server resolved it)', h.absUrl('https://other.example/p/z') === 'https://other.example/p/z');
  h.setInstanceUrl(null);
  ok('unmapping falls straight back to the browser origin', h.absUrl('/p/pgx') === 'http://box.lan:3456/p/pgx');
  h.setInstanceUrl('not a url');
  ok('a junk value is refused rather than poisoning every link', h.getInstanceUrl() === null && h.absUrl('/p/pgx') === 'http://box.lan:3456/p/pgx');
  ok('a non-path string is left alone', h.absUrl('relative/thing') === 'relative/thing');
}

// ── 2. the wire: the server must TELL the client (boot + live) ──
{
  ok('server exposes the effective instance URL on app.locals', read('server.js').includes("Object.defineProperty(app.locals, 'instancePublicUrl'"));
  ok('/api/home carries it to the client', read('src/routes/files.js').includes('instancePublicUrl: req.app.locals.instancePublicUrl'));
  const app = read('src/lib/app.js');
  ok('the client stores it at boot', app.includes('setInstanceUrl(d.instancePublicUrl'));
  ok('and follows the LIVE broadcast (mapping can flip with the tab open)', /msg\.type === 'instance-url'.*setInstanceUrl\(msg\.status\?\.effectiveUrl/.test(app));
}

// ── 3. every surface that hands a link to a human goes through it ──
{
  const surfaces = {
    'src/lib/chat-status-bar.js': 'design popover (Open / Copy link / row title)',
    'src/lib/file-explorer-ops.js': 'file browser Publish page… dialog',
    'src/lib/chat-renderers.js': '/p/<id> linkified in a chat reply',
    'src/lib/sidebar-rail.js': 'Ports panel path mount (/svc/<name>)',
  };
  for (const [f, what] of Object.entries(surfaces)) {
    const src = read(f);
    ok(`${what}: uses the shared helper`, /absUrl|absUrlShared/.test(src), f);
    ok(`${what}: NEGATIVE — no hand-rolled location.origin join left`, !/location\.origin\s*\+/.test(src) && !/\$\{location\.origin\}\$\{/.test(src), f);
  }
  // sibling sweep (the standing rule): device pairing hands an installer
  // command to a machine on ANOTHER network — this box's hostname is useless
  // there, so a mapped instance URL must win over location.origin too.
  const sm = read('src/lib/sidebar-mounts.js');
  ok('device-pair installer prefers relay/instance URL over the browser origin', sm.includes('r.relayUrl || getInstanceUrl() || location.origin'));
  // the design row must prefer the server's absolute url over re-joining a path
  const sb = read('src/lib/chat-status-bar.js');
  ok('design row prefers the SERVER-resolved url (it was preferring the relative path)', /const abs = \(p\) => absUrl\(p\.url \|\| p\.path\)/.test(sb), 'abs() shape changed');
  ok('and no call site passes a bare path any more', !sb.includes('abs(p.path || p.url)'));
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
