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
function fakePlugins({ configured = true, fail: failPublish = false } = {}) {
  const calls = { publish: [], unpublish: [], selfDial: [] };
  return {
    calls,
    status: () => ({ configured, missing: configured ? [] : ['serverAddr', 'token'], subDomainHost: 'relay.example', selfDialSub: 'remembered' }),
    frpPublish: async (name, port, opts) => {
      calls.publish.push({ name, port, opts });
      if (failPublish) throw new Error('relay down');
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
  second.restore({ retries: 1, delayMs: 5 });
  await sleep(3300);
  second.stop();
  ok('restore republishes on boot, on the SAME subdomain', second.url() === 'https://persisted.relay.example', second.url());
  // a relay that is down must not lose the intent
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iurl2-'));
  fs.writeFileSync(path.join(dir2, 'instance-url.json'), JSON.stringify({ desired: true, sub: 'x', url: 'https://x.relay.example/' }));
  const third = create({ dataDir: dir2, port: 3456, plugins: fakePlugins({ fail: true }), serverSetting: () => null, authEnabled: () => true, broadcast: () => { } });
  third.restore({ retries: 1, delayMs: 5 });
  await sleep(3300);
  third.stop();
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
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
