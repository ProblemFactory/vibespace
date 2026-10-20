#!/usr/bin/env node
// This instance's own public address (2.367.0, owner: "端口映射的地方加入一个把
// 整个vibespace映射一个frp url的地方吧, 映射之后所有需要'本机url'的地方就默认使用
// 那个url, 但不要覆盖原来的设置, incase取消了映射直接回归原来的设置").
//
// The whole feature is a PRECEDENCE question, so that is what this suite is:
//   frp mapping (explicit) > agentd.publicUrl > VIBESPACE_PUBLIC_URL > null
// and unmapping must land EXACTLY back on the setting — which is only possible
// because publishing never writes it. An `auto` publish (a side effect of a
// remote agent install) is recorded but must NOT outrank the setting.
// Plus: one publisher of the frp proxy, a refusal when auth is off, and a
// republish on boot for a mapping the user asked for.
// §7–§8 (lane fleet-instance-publish, a fleet canary red 2026-10-20): THE RELAY READ — the relay's status through the
// manager's door, and THE CENSUS of the object server.js hands this module (every member it reads is on it — from
// 2.369.214 a `providerId` it never carried made every read throw, read as «not configured»; this suite's fake answered
// status() whatever the id, so it passed); a failed read NAMED; the lock's refusal; THE UNLOCK'S RE-TRY (one cycle).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const { create } = require(path.join(REPO, 'src/server/instance-url.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a fake frp plugin: records calls, mints a URL from the subdomain
function fakePlugins({ configured = true, fail: failPublish = false, vaultLocked = false, readThrows = null } = {}) {
  const calls = { publish: [], unpublish: [], selfDial: [] };
  const st = { fail: failPublish };   // flipped by a leg (the relay comes back)
  return {
    calls, st,
    // the manager's relay door (src/plugins.js relayStatus — whichever plugin declares 'relay'); it takes no id
    relayStatus: () => { if (readThrows) throw new Error(readThrows); return { configured, missing: configured || vaultLocked ? [] : ['serverAddr', 'token'], vaultLocked, subDomainHost: 'relay.example', selfDialSub: 'remembered' }; },
    frpPublish: async (name, port, opts) => {
      calls.publish.push({ name, port, opts });
      if (vaultLocked) throw Object.assign(new Error('the vault is locked — the relay token opens after the owner unlocks it with the second password (the relay does not start until then)'), { code: 'vault_locked' });
      if (st.fail) throw new Error('relay down');
      const sub = opts.preferSub || 'assigned';
      return { name, subdomain: sub, proto: 'http', url: `https://${sub}.relay.example/` };
    },
    frpUnpublish: async (name) => { calls.unpublish.push(name); },
    setSelfDialSub: (s) => { calls.selfDial.push(s); },
  };
}
const mk = (opts = {}) => {
  const dir = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iurl-'));
  const settings = opts.settings || {};
  const events = [];
  const iu = create({
    dataDir: dir, port: 3456, plugins: opts.plugins || fakePlugins(),
    serverSetting: (k) => settings[k],
    authEnabled: () => opts.auth !== false,
    broadcast: (m) => events.push(m),
  });
  return { iu, dir, settings, events };
};

// ── 1. precedence + the fallback that must survive ──
{
  const { iu, settings } = mk();
  process.env.VIBESPACE_PUBLIC_URL = '';
  ok('nothing configured ⇒ no URL (callers fall back to the asking browser)', iu.url() === null && iu.effective().source === null);
  process.env.VIBESPACE_PUBLIC_URL = 'http://from-env:3456/';
  ok('env is used when nothing else is set', iu.url() === 'http://from-env:3456' && iu.effective().source === 'env');
  settings['agentd.publicUrl'] = 'https://configured.example/';
  ok('the setting outranks env', iu.url() === 'https://configured.example' && iu.effective().source === 'setting');
  const r = await iu.publish({ sub: 'mybox' });
  ok('publish returns the relay URL', r.url === 'https://mybox.relay.example/', JSON.stringify(r));
  ok('THE POINT: the mapping outranks the setting', iu.url() === 'https://mybox.relay.example' && iu.effective().source === 'frp');
  ok('THE OTHER POINT: the setting was NOT overwritten', settings['agentd.publicUrl'] === 'https://configured.example/');
  await iu.unpublish();
  ok('unmapping lands exactly back on the setting', iu.url() === 'https://configured.example' && iu.effective().source === 'setting');
  delete settings['agentd.publicUrl'];
  ok('and with no setting, back to env', iu.url() === 'http://from-env:3456');
  process.env.VIBESPACE_PUBLIC_URL = '';
}

// ── 2. auto (side-effect) publishes are visible but do NOT repoint anything ──
{
  const { iu, settings } = mk();
  settings['agentd.publicUrl'] = 'https://configured.example';
  const u = await iu.ensurePublished();
  ok('ensurePublished mints a URL for the caller that needs a dial-back address', /^https:\/\/remembered\.relay\.example/.test(u), u);
  ok('an AUTO publish does NOT outrank the setting (a side effect must not repoint share links)', iu.url() === 'https://configured.example' && iu.effective().source === 'setting');
  ok('but it IS recorded + shown', iu.status().published === true && iu.status().auto === true);
  const st = iu.status();
  ok('status names both addresses so the UI can explain itself', st.url && st.settingUrl === 'https://configured.example' && st.effectiveUrl === 'https://configured.example');
  // with NO setting at all, a live auto URL is still better than nothing
  delete settings['agentd.publicUrl'];
  ok('with nothing configured, the auto URL is used (source says so)', iu.url() === 'https://remembered.relay.example' && iu.effective().source === 'frp-auto');
}

// ── 3. one publisher, stable subdomain, second call is free ──
{
  const { iu } = mk();
  const p = iu.status();
  ok('the remembered self-dial subdomain is offered as the default', p.sub === 'remembered');
  await iu.publish({ sub: 'stable' });
  const before = iu.status().sub;
  await iu.unpublish();
  ok('unmapping KEEPS the subdomain so a remap lands on the same URL', iu.status().sub === before && before === 'stable');
  await iu.publish({});
  ok('remap reuses it', iu.url() === 'https://stable.relay.example');
}
{
  const pl = fakePlugins();
  const { iu } = mk({ plugins: pl });
  await iu.ensurePublished();
  await iu.ensurePublished();
  ok('a second ensurePublished does not re-publish (one relay proxy, one owner)', pl.calls.publish.length === 1);
  ok('it publishes THIS instance\'s own port under the shared proxy name', pl.calls.publish[0].port === 3456 && pl.calls.publish[0].name === 'vibespace-instance');
  ok('the subdomain is handed back to the plugin so other callers reuse it', pl.calls.selfDial.includes('remembered'));
}

// ── 4. refusals are loud and name the fix ──
{
  const { iu } = mk({ auth: false });
  let err = null;
  try { await iu.publish({}); } catch (e) { err = e.message; }
  ok('publishing with auth OFF is refused (it would be an open instance on the internet)', /password or SSO/i.test(err || ''), err);
  ok('and nothing was published', iu.status().published === false);
}
{
  const { iu } = mk({ plugins: fakePlugins({ configured: false }) });
  let err = null;
  try { await iu.publish({}); } catch (e) { err = e.message; }
  ok('no relay ⇒ refused, naming WHICH fields are missing', /not configured/.test(err || '') && /serverAddr/.test(err || ''), err);
}
{
  const { iu } = mk();
  let err = null;
  try { await iu.publish({ sub: 'Bad_Sub!' }); } catch (e) { err = e.message; }
  ok('a malformed subdomain is refused', /lowercase/.test(err || ''), err);
}

// ── 5. persistence + boot republish (a mapping the user asked for comes back) ──
{
  const { iu, dir } = mk();
  await iu.publish({ sub: 'persisted' });
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'instance-url.json'), 'utf-8'));
  ok('state persists (desired + subdomain + url)', raw.desired === true && raw.sub === 'persisted' && !!raw.url, JSON.stringify(raw));
  const pl = fakePlugins();
  const second = create({ dataDir: dir, port: 3456, plugins: pl, serverSetting: () => null, authEnabled: () => true, broadcast: () => { } });
  ok('a fresh process still knows it is mapped (frpc is its own process — the mapping usually outlives a restart)', second.status().desired === true && second.status().url === 'https://persisted.relay.example/');
  // a relay that is down must not lose the intent
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iurl2-'));
  fs.writeFileSync(path.join(dir2, 'instance-url.json'), JSON.stringify({ desired: true, sub: 'x', url: 'https://x.relay.example/' }));
  const third = create({ dataDir: dir2, port: 3456, plugins: fakePlugins({ fail: true }), serverSetting: () => null, authEnabled: () => true, broadcast: () => { } });
  // BOTH boots restore at once (lane fast-tier-ratchet): restore's first attempt is its own fixed 3 s boot delay, and the
  // two processes share nothing — waited one after another they slept 6.6 s of the suite's 6.6
  second.restore({ retries: 1, delayMs: 5 });
  third.restore({ retries: 1, delayMs: 5 });
  await sleep(3300);
  second.stop();
  third.stop();
  ok('restore republishes on boot, on the SAME subdomain', second.url() === 'https://persisted.relay.example', second.url());
  ok('a failed republish keeps the intent and SAYS why (no silent disappearance)', third.status().desired === true && /relay down/.test(third.status().error || ''), JSON.stringify(third.status()));
  ok('a failed republish does not erase the last known URL either (it may still be live)', third.status().url === 'https://x.relay.example/');
  fs.rmSync(dir2, { recursive: true, force: true });
}

// ── 6. wiring pins (the unstaged-wiring class) ──
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const sv = read('server.js');
  ok('server.js creates the resolver + registers its routes + restores on boot', sv.includes("instance-url.js').create") && sv.includes('instanceUrl.registerRoutes(app)') && sv.includes('instanceUrl.restore()'));
  ok('EVERY "this instance\'s URL" consumer goes through it', (sv.match(/instanceUrl\.url\(\)/g) || []).length >= 3, String((sv.match(/instanceUrl\.url\(\)/g) || []).length));
  ok('NEGATIVE: no consumer reads agentd.publicUrl inline any more', !/serverSetting\('agentd\.publicUrl'\)/.test(sv), 'server.js still has an inline read');
  const w = read('src/server/mounts-plugins-wiring.js');
  ok('the agent-install path no longer publishes the instance behind our back', !w.includes("frpPublish('vibespace-instance'") && (w.match(/instanceUrl\.ensurePublished\(\)/g) || []).length === 2);
  ok('and it resolves its base URL through the same resolver', w.includes('instanceUrl?.url()') && !/serverSetting\('agentd\.publicUrl'\)/.test(w));
  const rail = read('src/lib/sidebar-rail.js');
  ok('the Ports panel has the "This VibeSpace" row', rail.includes('_renderInstanceUrlRow') && rail.includes("tr('This VibeSpace')"));
  ok('the row is rendered by the panel', rail.includes('await this._renderInstanceUrlRow(c, api, render)'));
  ok('the row hits the instance-url API both ways', rail.includes("'/api/instance-url/publish', { method: 'DELETE' }") && rail.includes("'/api/instance-url/publish', { method: 'POST'"));
  ok('the row SAYS what happens to the configured address', rail.includes('is kept and restored when you unmap'));
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(`${path.basename(f)} carries the new keys`, read(f).includes("'This VibeSpace'") && read(f).includes("'Mapped: {url}'"));
}

// ── 7. THE RELAY READ (lane fleet-instance-publish — a fleet canary red, 2026-10-20) ──
// A pod's boot restore refused «the frp relay is not configured on this instance» while frpc ran: every read was
// plugins.status(plugins.providerId?.('relay')) over the object server.js hands this module, which never carried
// providerId ⇒ status(undefined) threw «unknown plugin: undefined» and the catch said «not configured» — on every instance,
// from 2.369.214 (the publish button too). THE CENSUS: every member instance-url.js reads on `plugins` is a key of that
// object, and every key is a PluginManager method.
{
  const acorn = require('acorn');
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  const walk = (n, fn) => { if (!n || typeof n.type !== 'string') return; fn(n); for (const v of Object.values(n)) { if (Array.isArray(v)) for (const c of v) walk(c, fn); else if (v && typeof v.type === 'string') walk(v, fn); } };
  /** the members instance-url.js reads on `plugins` (a call, an optional call, a bare read) */
  const readsOf = (src) => { const out = new Set(); walk(parse(src), (n) => { if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'plugins') out.add(n.property.name); }); return [...out].sort(); };
  /** the keys of the object server.js hands `require('./src/server/instance-url.js').create({ plugins })` — null: no such object */
  const handedOf = (src) => {
    let keys = null;
    walk(parse(src), (n) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.property.name !== 'create') return;
      const o = n.callee.object;
      if (!(o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'require' && /instance-url\.js$/.test(String((o.arguments[0] || {}).value || '')))) return;
      const p = ((n.arguments[0] || {}).properties || []).find((q) => q.key && q.key.name === 'plugins');
      if (p && p.value.type === 'ObjectExpression') keys = p.value.properties.map((q) => q.key.name).sort();
    });
    return keys;
  };
  const judge = (iuSrc, svSrc) => { const handed = handedOf(svSrc) || []; return readsOf(iuSrc).filter((m) => !handed.includes(m)); };
  const IU = read('src/server/instance-url.js'), SV = read('server.js');
  const reads = readsOf(IU), handed = handedOf(SV);
  ok(`the census sees what it judges: instance-url reads ${reads.join(' · ')} on plugins; server.js hands ${handed ? handed.join(' · ') : 'NOTHING'}`, reads.includes('relayStatus') && reads.includes('frpPublish') && Array.isArray(handed) && handed.length >= 4, JSON.stringify({ reads, handed }));
  const missing = judge(IU, SV);
  ok('THE CENSUS: every member instance-url.js reads on `plugins` is on the object server.js hands it', missing.length === 0, missing.join(', '));
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const notPM = (handed || []).filter((k) => typeof PluginManager.prototype[k] !== 'function');
  ok('…and every key of that object is a PluginManager method (relayStatus = the relay\'s status, beside frpPublish / frpUnpublish / setSelfDialSub)', !!handed && notPM.length === 0, notPM.join(', '));
  // RED CONTROLS — the two lines 2.369.214–.330 shipped
  const iuBase = IU.replace(/  const frp = \(\) => \{[^\n]*\n/, "  const frp = () => { try { return plugins ? plugins.status(plugins.providerId?.('relay')) : null; } catch { return null; } };\n");
  const svBase = SV.replace('plugins: { relayStatus: () => plugins.relayStatus(), frpPublish:', 'plugins: { status: (id) => plugins.status(id), frpPublish:');
  const m1 = iuBase !== IU && svBase !== SV ? judge(iuBase, svBase) : null;
  ok('RED CONTROL the base (instance-url\'s providerId read over server.js\'s object of .214–.330) ⇒ the census names `providerId`', !!m1 && m1.includes('providerId'), m1 ? m1.join(', ') : 'the control did not apply');
  const m2 = svBase !== SV ? judge(IU, svBase) : null;
  ok('RED CONTROL the fixed read over the OLD object ⇒ the census names `relayStatus`', !!m2 && m2.includes('relayStatus'), m2 ? m2.join(', ') : 'the control did not apply');
}
{
  // a relay read that FAILED is named — never «not configured» (that swallow hid the red above for 15 days)
  const { iu } = mk({ plugins: fakePlugins({ readThrows: 'unknown plugin: undefined' }) });
  let err = null; try { await iu.publish({}); } catch (e) { err = e.message; }
  ok('a relay read that THROWS is refused BY NAME (what the read said), never «not configured»', /could not be read \(unknown plugin: undefined\)/.test(err || '') && !/not configured/.test(err || ''), err);
  ok('…and the panel\'s status carries it (frpReadError), frpConfigured false', iu.status().frpReadError === 'unknown plugin: undefined' && iu.status().frpConfigured === false, JSON.stringify(iu.status()));
}
{
  // the relay's only key SEALED in a LOCKED vault: the publish reaches the plugin, whose refusal names the lock
  const pl = fakePlugins({ configured: false, vaultLocked: true });
  const { iu } = mk({ plugins: pl });
  let err = null; try { await iu.publish({}); } catch (e) { err = e.message; }
  ok('the vault LOCKED holding the relay\'s only key: the plugin\'s own refusal (it names the lock), not «not configured»', /vault is locked/.test(err || '') && pl.calls.publish.length === 1, err);
}

// ── 8. THE UNLOCK'S RE-TRY (lane fleet-instance-publish, the second half) — the vault's unlock calls restore({ ifFailed }):
// a cycle waiting on its timer has its next try pulled forward; none running ⇒ ONE new cycle; nothing failed ⇒ nothing ──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iurl3-'));
  fs.writeFileSync(path.join(dir, 'instance-url.json'), JSON.stringify({ desired: true, sub: 'podx' }));
  const pl = fakePlugins({ fail: true });
  const iu = create({ dataDir: dir, port: 3456, plugins: pl, serverSetting: () => null, authEnabled: () => true, broadcast: () => { } });
  iu.restore({ ifFailed: true, firstMs: 5 });
  await sleep(40);
  ok('restore({ ifFailed }) with no failure on record tries nothing (a mapping that came back is left alone)', pl.calls.publish.length === 0);
  iu.restore({ retries: 2, delayMs: 60000, firstMs: 5 });
  await sleep(40);
  ok('the boot\'s cycle: its first try failed and SAYS why; the next waits (60 s here)', pl.calls.publish.length === 1 && /relay down/.test(iu.status().error || ''), String(pl.calls.publish.length));
  iu.restore({ ifFailed: true, firstMs: 5 });   // an unlock, the relay still down
  await sleep(60);
  ok('an unlock PULLS the waiting try forward (now, not in 60 s) — the cycle\'s own budget: its last try spent, no timer left (bounded)', pl.calls.publish.length === 2, String(pl.calls.publish.length));
  pl.st.fail = false;
  await sleep(40);
  ok('…and nothing tries again by itself', pl.calls.publish.length === 2);
  iu.restore({ ifFailed: true, firstMs: 5 });   // the next unlock, the relay back
  await sleep(60);
  ok('the next unlock (no cycle running) starts ONE new cycle — republished, the error cleared', pl.calls.publish.length === 3 && iu.url() === 'https://podx.relay.example' && !iu.status().error, JSON.stringify(iu.status()));
  iu.stop();
  const w = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok('the vault\'s unlock calls it (mounts-plugins-wiring.js, beside mounts\' own restore after the unlock)', /^vault\.onUnlock\(\(\) => \{ try \{ instanceUrl\?\.restore\?\.\(\{ ifFailed: true \}\); \}/m.test(w));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
