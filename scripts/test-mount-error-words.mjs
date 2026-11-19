#!/usr/bin/env node
// B-af94 — A MOUNT'S WORDS REACH A zh / ja READER IN THEIR LANGUAGE. The cloud rows (src/mounts.js), the pull rows and every
// machine-mount refusal (src/machine-mounts.js, src/device-mount.js) sent English sentences only; the page showed them raw.
// Now ONE table (src/mount-error-words.js) holds each sentence under a CODE: the hub fills its English (the row's / route's
// `error`, the journal) and sends the code + params beside it; the page (src/lib/sidebar-mounts.js mountErrorText / thrownText
// / mmApi) words the same code through t() — a zh and a ja row each (src/lib/i18n-zh.js / i18n-ja.js), a `liveness_<key>` code
// from the verdicts' own en / zh / ja table (src/mount-liveness.js). Pinned here:
//   ① every template has a zh and a ja row, holding the same {params};
//   ② the English is the release's, byte for byte (the hub's words did not move — but «not empty», now the page's spelling);
//   ③ the REAL producers: MachineMounts refusals carry code + params (remount: unknown / offline; mountPull: a relative path),
//      a route's answer (errorBody) carries them and never a system code; MountManager's row carries a code ONLY while its
//      words are that code's (a reconnect's, a parked verdict's, a thrown refusal's; a paramless sentence of ours by its words;
//      an rclone tail none);
//   ④ the page: a code in zh / ja, a liveness verdict from its table, an unknown code → the hub's English;
//   ⑤ the wiring: the three machine-mount routes + the cloud connect route answer errorBody, the row spreads _errorCodeOf, the
//      page's doors go through mmApi and its rows through mountErrorText; no table sentence is still typed in a producer;
//   RED CONTROLS: the release's route answer ({ error } only) leaves a zh reader with English; a dictionary missing a row is
//      named; MountManager compiled without the words check labels an rclone tail with a stale code.
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
import { dictEntries } from './i18n-extract.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { ok, report } = checker();
const SCR = scratch('mount-error-words'); fs.mkdirSync(SCR, { recursive: true });
const MW = require(path.join(REPO, 'src/mount-error-words.js'));
const LIVENESS = require(path.join(REPO, 'src/mount-liveness.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══ ① every template: a zh and a ja row, the same {params} ═══
console.log('① every template has a zh and a ja row');
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const TEMPLATES = [...Object.values(MW.WORDS), ...Object.values(MW.PARTS)];
const missingIn = (dictText) => { const d = new Map(dictEntries(dictText).map((e) => [e.key, e.value])); return TEMPLATES.filter((k) => !d.has(k) || holes(d.get(k)) !== holes(k) || d.get(k) === k); };
const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
ok(TEMPLATES.length >= 45 && missingIn(ZH).length === 0 && missingIn(JA).length === 0, `① ${TEMPLATES.length} templates: each has a zh and a ja row (not left in English) holding the same {params}`, { zh: missingIn(ZH), ja: missingIn(JA) });
ok(Object.keys(MW.WORDS).every((c) => MW.CODE_RE.test(c)), '① every code is a lower-snake name');

// ═══ ② the English is the release's ═══
console.log('② the hub\'s English did not move');
const RELEASE = [   // the release's sentences, as src/machine-mounts.js / device-mount.js / mounts.js typed them
  ['unknown_mount', {}, 'unknown machine mount'],   // stale-pins: kept — the release's words
  ['machine_offline_start', {}, 'machine is offline — start its daemon first'],
  ['remote_path_relative', {}, 'remotePath must be absolute (a folder ON the machine)'],   // stale-pins: kept — the release's words
  ['folder_missing', { path: '/x' }, 'folder does not exist on this instance: /x'],
  ['folder_hung', { path: '/x' }, 'folder is not responding (its backing mount/storage may be stalled): /x — reconnect that storage first, or share a plain local folder'],
  ['push_loop_own', { machine: 'Box', remotePath: '/srv' }, "this folder is the live mirror of Box's own /srv — it already lives on that machine; open it there directly instead of mounting it back"],
  ['pull_mount_timed_out', { s: 150 }, 'pull mount timed out after 150s — the device link may be stalled (machine asleep/offline?); wake the machine and retry'],
  ['mount_removed', {}, 'this pull mount was removed while it was being mounted — nothing of it stays mounted'],   // stale-pins: kept — the release's words
  ['unmount_hung', { mountpoint: '/m', s: 4 }, 'could not release the folder /m — its unmount did not answer in 4 s'],
  ['webdav_mount_exited', { detail: 'no message' }, 'rclone webdav mount exited: no message'],
  ['s3_access_denied', { target: 'b/p' }, 'the credential can’t access “b/p” (AccessDenied) — check the bucket name (S3 buckets are lowercase letters/digits/hyphens) and the token’s bucket scope'],
  ['start_hung', { s: 90 }, 'rclone made no progress for 90 s and never mounted — stopped it; will retry'],
  ['reconnecting', { n: 2 }, 'storage disconnected — auto-reconnecting (attempt 2)…'],
  ['mp_no_permission', { mp: '/m', owner: 'u' }, "No permission to create the mount point /m — pick a writable location, or create it yourself first: sudo mkdir -p '/m' && sudo chown u '/m'"],   // stale-pins: kept — the release's words
  ['onedrive_lookup_failed', { status: 503 }, 'OneDrive drive lookup failed (HTTP 503)'],   // stale-pins: kept — the release's words
  ['device_link_slow', { s: 10 }, 'device link not responding within 10s — it may be flapping; reconnection keeps retrying in the background, try again shortly'],   // stale-pins: kept — the release's words
  ['mount_point_in_use', { machine: 'Box', remotePath: '/srv', held: true }, 'this folder is also the mount point of “Box”’s /srv — remove one of the two rows'],
  ['mount_point_in_use', { machine: 'Box', remotePath: '/srv', held: false }, 'this folder is already the mount point of “Box”’s /srv — pick another folder (one folder holds one machine’s folder)'],
  ['mount_point_in_use', { removed: true, remotePath: '/srv', held: false }, 'this folder is already the mount point of a removed machine’s /srv — remove that row in Mounts, or pick another folder'],
  ['mount_point_nested', { machine: 'Box', remotePath: '/srv', mountpoint: '/m', kind: 'inside', held: false }, 'this folder is inside /m, the mount point of “Box”’s /srv — unmounting one would take the other with it; pick a folder outside it'],
  ['mount_point_nested', { removed: true, remotePath: '/srv', mountpoint: '/m', kind: 'over', held: true }, 'this folder holds /m, the mount point of a removed machine’s /srv — unmounting one would take the other with it; remove one of the two rows'],
];
const moved = RELEASE.filter(([c, p, en]) => MW.wordsFor(c, p) !== en);
ok(moved.length === 0, `② ${RELEASE.length} sentences: the hub's English for each code is the release's, byte for byte`, moved.map(([c, p]) => [c, MW.wordsFor(c, p)]));
const longTail = 'x'.repeat(400);
ok(MW.wordsFor('cephfs_failed', { detail: longTail.slice(0, 200 - 'CephFS mount failed: '.length) }) === ('CephFS mount failed: ' + longTail).slice(0, 200), '② CephFS: the detail is cut so the words are the release\'s 200-character line');

// ═══ ③ the REAL producers ═══
console.log('③ the producers carry code + params');
{
  const { MachineMounts } = require(path.join(REPO, 'src/machine-mounts.js'));
  const dd = path.join(SCR, 'mm'); fs.mkdirSync(dd, { recursive: true });
  fs.writeFileSync(path.join(dd, 'machine-mounts.json'), JSON.stringify({ mounts: [{ id: 'p1', dir: 'pull', hostId: 'h1', remotePath: '/srv/data', mountpoint: path.join(SCR, 'mp1'), createdAt: 1 }] }));
  let online = false;
  const hosts = { get: (id) => { if (id !== 'h1') throw new Error('no such machine'); return { id, name: 'Box', transport: 'dial', deviceId: 'd1' }; }, dialOnline: () => online };
  const mm = new MachineMounts({ dataDir: dd, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } }); clearInterval(mm._sweep);
  const caught = (p) => p.then(() => null, (e) => e);
  const e1 = await caught(mm.remount('nope')), e2 = await caught(mm.remount('p1'));
  ok(!!e1 && e1.code === 'unknown_mount' && e1.message === 'unknown machine mount' && !!e2 && e2.code === 'machine_offline_start' && e2.message === 'machine is offline — start its daemon first',   // stale-pins: kept — the release's words
    '③ MachineMounts.remount: an unknown id and an offline machine refuse BY CODE, the English kept as the message', [e1 && e1.code, e2 && e2.code]);
  online = true;
  const e3 = await caught(mm.mountPull('h1', { remotePath: 'not/absolute' }));
  ok(!!e3 && e3.code === 'remote_path_relative' && same(e3.params, {}) && e3.message === MW.wordsFor('remote_path_relative'), '③ mountPull: a relative folder refuses remote_path_relative', e3 && [e3.code, e3.message]);
  ok(same(MW.errorBody(e2), { error: e2.message, code: 'machine_offline_start', params: {} }) && same(MW.errorBody(Object.assign(new Error('boom'), { code: 'ENOENT' })), { error: 'boom' }) && same(MW.errorBody(new Error('raw')), { error: 'raw' }),
    '③ errorBody: a worded refusal answers {error, code, params}; a system code (ENOENT) or none answers the words only');
  const slowW = MW.wordsFor('device_link_slow', { s: 10 });
  ok(same(MW.errorBody(new Error('host not found')), { error: 'host not found', code: 'host_not_found', params: {} }) && same(MW.errorBody(new Error(slowW)), { error: slowW, code: 'device_link_slow', params: { s: '10' } })
    && same(MW.codeOfWords(MW.wordsFor('mp_no_permission', { mp: '/m', owner: 'u' })), { code: 'mp_no_permission', params: { mp: '/m', owner: 'u' } }) && MW.codeOfWords('rclone: Failed to create file system') === null,
    '③ a sentence of ours thrown with NO code (src/hosts.js\'s «host not found» and slow device link — their error contract is other roads\' too) is found by its WORDS, its holes read back as params; tool text is not');   // stale-pins: kept — the registry's runtime words
  const dmSrc = read('src/device-mount.js');
  ok(/refusal\('unmount_hung', \{ mountpoint, s: Math\.round\(ms \/ 1000\) \}\)/.test(dmSrc) && /refusal\('serve_folder_failed'/.test(dmSrc) && /refusal\(rcGone \? 'webdav_mount_exited' : 'webdav_mount_not_up'/.test(dmSrc),
    '③ device-mount: the hung release, serve-folder and the webdav mount refuse by code');
  const mmSrc = read('src/machine-mounts.js');
  ok((mmSrc.match(/this\._sayCode\(rec\.id, e\);/g) || []).length === 2 && mmSrc.includes("words = MW.wordsFor('mount_not_empty')"), '③ the pull row keeps a hung release\'s code (both roads) and «not empty» is the table\'s');
}
{
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const md = path.join(SCR, 'cm'); fs.mkdirSync(md, { recursive: true });
  const cm = new MountManager({ dataDir: md, broadcast: () => { } }); cm._save = () => { };
  const rec = { id: 'c1', type: 'webdav', name: 'dav', parked: { strikes: 3 } }; cm._state.mounts.push(rec);
  const rows = [];
  cm._errors.set('c1', cm._sayW('c1', 'reconnecting', { n: 2 })); rows.push(['reconnect', cm._errorCodeOf('c1'), { errorCode: 'reconnecting', errorParams: { n: 2 } }]);
  cm._errors.set('c1', 'rclone: Failed to create file system: some tail'); rows.push(['an rclone tail after it', cm._errorCodeOf('c1'), {}]);
  cm._errors.set('c1', 'credential expired'); rows.push(['a paramless sentence of ours (by its words)', cm._errorCodeOf('c1'), { errorCode: 'credential_expired', errorParams: {} }]);
  cm._errors.set('c1', cm._parkedWords(rec)); rows.push(['the parked verdict', cm._errorCodeOf('c1'), { errorCode: 'liveness_wedged', errorParams: { N: 3 } }]);
  cm._errors.set('c1', cm._sayE('c1', MW.refusal('root_denied'))); rows.push(['a thrown refusal', cm._errorCodeOf('c1'), { errorCode: 'root_denied', errorParams: {} }]);
  cm._errors.set('c1', cm._sayE('c1', Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))); rows.push(['a system error', cm._errorCodeOf('c1'), {}]);
  const bad = rows.filter(([, got, want]) => !same(got, want));
  ok(bad.length === 0 && cm._errors.get('c1') === 'EACCES: permission denied', `③ MountManager: a row's code only while ITS words are the row's — ${rows.map((r) => r[0]).join(' · ')}`, bad);
  ok(cm._parkedWords(rec) === LIVENESS.wordsFor('wedged', 'en', { N: 3 }), '③ the parked words are the verdict table\'s English, unchanged');
  const MSx = read('src/mounts.js');
  ok(MSx.includes('this._errors.set(id, coded ? this._sayCoded(id, msg, coded[0], coded[1]) : msg);') && MSx.includes('this._errors.delete(id); this._errorCodes?.delete(id);')
    && (MSx.match(/\.\.\.coded\(row\)/g) || []).length === 2 && MSx.includes("code: 'storage_not_connected'") && read('src/mount-providers/onedrive.js').includes('x._errors.set(id, x._sayE(id, e))')
    && read('src/lib/user-todos-actions.js').includes("String(checkRow.checkRoute).startsWith('/api/mounts/') && mountWords(r.code, r.params, { t, lang: resolveLang() })") && read('src/server/mounts-plugins-wiring.js').includes("catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }   // B-af94: a coded refusal keeps its code"),
    '③ the read\'s cures wired: a stopped start records its code WITH its words (after the kill\'s await); a removed record\'s code goes with it; the For-you Reconnect answers the row\'s code (route errorBody, the page words it); OneDrive\'s pre-flight keeps a coded refusal\'s code');
}

// ═══ ④ the page ═══
console.log('④ the page words a code in the reader\'s language');
const tOf = (dictText) => { const d = new Map(dictEntries(dictText).map((e) => [e.key, e.value])); return (s, p) => MW.fill(d.has(s) ? d.get(s) : s, p); };
const tZh = tOf(ZH), tJa = tOf(JA);
const held = { machine: 'Box', remotePath: '/srv', mountpoint: '/m', kind: 'inside', held: true };
ok(MW.wordsFor('machine_offline_start', {}, { t: tZh, lang: 'zh' }) === '机器离线——先启动它的守护进程' && MW.wordsFor('reconnecting', { n: 4 }, { t: tJa, lang: 'ja' }) === 'ストレージが切断されました — 自動で再接続しています（4 回目）…'
  && MW.wordsFor('mount_point_nested', held, { t: tZh, lang: 'zh' }) === '这个文件夹在 /m 里面，那是 “Box”的 /srv 的挂载位置——卸载其中一个会把另一个一起带走；请删掉两行中的一行',
  '④ a code in zh and in ja, a composed one with its {who} worded first', [MW.wordsFor('mount_point_nested', held, { t: tZh, lang: 'zh' })]);
ok(MW.wordsFor('liveness_slow', { s: 12 }, { t: tZh, lang: 'zh' }) === LIVENESS.wordsFor('slow', 'zh', { s: 12 }) && MW.wordsFor('liveness_wedged', { N: 2 }, { lang: 'ja' }) === LIVENESS.wordsFor('wedged', 'ja', { N: 2 }) && MW.wordsFor('liveness_slow', { s: 12 }) === LIVENESS.wordsFor('slow', 'en', { s: 12 }),
  '④ a liveness verdict is worded from its own en / zh / ja table');
const liveMiss = Object.keys(LIVENESS.WORDS).filter((k) => !MW.known(MW.LIVE + k) || MW.wordsFor(MW.LIVE + k, { s: 1, n: 1, N: 2, min: 3 }, { lang: 'zh' }) !== LIVENESS.wordsFor(k, 'zh', { s: 1, n: 1, N: 2, min: 3 }));
ok(liveMiss.length === 0 && Object.keys(LIVENESS.WORDS).includes('wedgedRetry'), `④ EVERY verdict key of the table (${Object.keys(LIVENESS.WORDS).length}, wedgedRetry\'s own spelling too) is a code the page words`, liveMiss);
ok(MW.wordsFor('no_such_code', {}, { t: tZh }) === null && MW.wordsFor(undefined, {}) === null && MW.wordsFor('liveness_nope', {}) === null && MW.wordsFor('constructor', {}) === null, '④ an unknown code (or none) → null: the page shows the hub\'s English');
const SB = read('src/lib/sidebar-mounts.js');
const fnBody = (name) => { const i = SB.indexOf(`export function ${name}(`); return i < 0 ? '' : SB.slice(i, SB.indexOf('\n}\n', i)); };
ok(/MW\.wordsFor\(m && m\.errorCode, \(m && m\.errorParams\) \|\| \{\}, \{ t: tr, lang: resolveLang\(\) \}\) \|\| String\(\(m && m\.error\) \|\| ''\)/.test(fnBody('mountErrorText'))
  && /MW\.wordsFor\(e && e\.code, \(e && e\.body && e\.body\.params\) \|\| \{\}, \{ t: tr, lang: resolveLang\(\) \}\) \|\| \(e && e\.message\) \|\| fallback/.test(fnBody('thrownText')),
  '④ the page\'s two words functions: the code through t() in the device\'s language, else the hub\'s English');

// ═══ ⑤ the wiring ═══
console.log('⑤ the wiring');
const SJ = read('server.js'), PW = read('src/server/mounts-plugins-wiring.js'), MS = read('src/mounts.js'), MMS = read('src/machine-mounts.js');
ok((SJ.match(/res\.status\(400\)\.json\(require\('\.\/src\/mount-error-words\.js'\)\.errorBody\(e\)\)/g) || []).length === 3 && !/app\.(post|delete)\('\/api\/machine-mounts[^\n]*\n?[^\n]*json\(\{ error: e\.message \}\)/.test(SJ),
  '⑤ server.js: the three machine-mount routes answer errorBody (no line added)');
const mountRoute = PW.slice(PW.indexOf("app.post('/api/mounts/:id/mount'"), PW.indexOf('app.post(', PW.indexOf("app.post('/api/mounts/:id/mount'") + 10));
ok(mountRoute.includes("require('../mount-error-words.js').errorBody(e)") && MS.includes('error: this._errors.get(m.id) || null, ...this._errorCodeOf(m.id),'), '⑤ the cloud connect route answers errorBody; the cloud row spreads _errorCodeOf');
ok((SB.match(/mmApi\(`\/api\/(machine-mounts|mounts)\//g) || []).length === 10 && !/[^m]api\(`\/api\/machine-mounts\//.test(SB) && !/[^m]api\(`\/api\/mounts\/\$\{[^}]+\}\/mount`/.test(SB),   // stale-pins: kept — an absence check
  '⑤ the page: every machine-mount door and every cloud connect goes through mmApi (a refusal comes back worded)', (SB.match(/mmApi\(`\/api\/(machine-mounts|mounts)\//g) || []).length);
ok(SB.includes("(m.error ? mountErrorText(m) : tr('Not mounted'))") && SB.includes("tr('Couldn’t connect:') + ' ' + mountErrorText(m).slice(0, 300)") && SB.includes('err.title = mountErrorText(m);') && /m\.error \? escHtml\(pullErrorText\(m\)\)/.test(SB),
  '⑤ the page: the cloud row\'s dot and «Couldn\'t connect» line, and the pull row\'s dot, read the words functions');
const typed = Object.entries(MW.WORDS).filter(([, s]) => !/\{\w+\}/.test(s));
const stillTyped = typed.filter(([c, s]) => [MMS, read('src/device-mount.js')].some((src) => src.includes(`'${s.replace(/'/g, "\\'")}'`)));
const byWords = ['share_expired', 'share_revoked', 'oauth_dead', 'list_failed', 'reads_rejected', 'mount_cant_tell', 's3_sts_proxy', 'start_exited', 'credential_expired', 'onedrive_token_unreadable', 'onedrive_token_expired', 'onedrive_no_drive', 'self_mount', 'host_not_found'];
const PRODUCERS = [MS, read('src/mount-providers/vibespace.js'), read('src/hosts.js')].join('\n');
const lost = byWords.filter((c) => !PRODUCERS.includes(MW.WORDS[c]));
const slowPieces = MW.WORDS.device_link_slow.split(/\{\w+\}/).filter(Boolean);   // its read 2: hosts.js's slow-link sentence is found by its words — its literal pieces must stay hosts.js's
if (!slowPieces.every((x) => read('src/hosts.js').includes(x))) lost.push('device_link_slow');
ok(stillTyped.length === 0 && lost.length === 0, `⑤ no machine-mount sentence is still typed beside the table; the ${byWords.length} cloud sentences worded BY THEIR WORDS are still mounts.js's own (else the page could not find them)`, { stillTyped: stillTyped.map((x) => x[0]), lost });

// ═══ RED CONTROLS ═══
console.log('RED CONTROLS');
{
  const e = MW.refusal('machine_offline_start');
  const page = (body) => MW.wordsFor(body.code, body.params || {}, { t: tZh, lang: 'zh' }) || body.error;   // thrownText's rule (④ pins its shape)
  const release = { error: e.message };
  ok(page(release) === 'machine is offline — start its daemon first' && page(MW.errorBody(e)) === '机器离线——先启动它的守护进程', 'CONTROL (the shape, not the route — ⑤ pins the routes): an answer shaped as the release\'s routes answered ({ error } only — ⑤ pins that no machine-mount route still does) leaves a zh reader with the English; errorBody\'s answer is worded');
  const cut = ZH.split('\n').filter((l) => !l.startsWith('  "machine is offline — start its daemon first":')).join('\n');
  ok(cut.length < ZH.length && same(missingIn(cut), ['machine is offline — start its daemon first']), 'CONTROL (RED): a zh dictionary missing one row — ① names it');
  const from = 'if (c && c.words === words) return { errorCode: c.code, errorParams: c.params };';
  const src = read('src/mounts.js');
  if (src.split(from).length !== 2) ok(false, 'CONTROL: the words-check anchor moved in src/mounts.js — update this suite');
  else {
    const file = path.join(REPO, 'src/mounts.js'), m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    m._compile(src.replace(from, 'if (c) return { errorCode: c.code, errorParams: c.params };'), file);
    const md = path.join(SCR, 'cm-ctl'); fs.mkdirSync(md, { recursive: true });
    const cc = new m.exports.MountManager({ dataDir: md, broadcast: () => { } }); cc._save = () => { };
    cc._errors.set('c1', cc._sayW('c1', 'reconnecting', { n: 2 }));
    cc._errors.set('c1', 'rclone: Failed to create file system: some tail');
    ok(same(cc._errorCodeOf('c1'), { errorCode: 'reconnecting', errorParams: { n: 2 } }), 'CONTROL (RED): without the words check, an rclone tail after a reconnect is shown as «auto-reconnecting (attempt 2)» — words the row no longer has');
  }
}

report();
