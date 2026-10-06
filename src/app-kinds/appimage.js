'use strict';
/** THE `appimage` APP KIND (design 009 S2) — no root at all: UNPACKED into the user's own ~/.vibespace/apps/appimage/<id>/
 *  at the click, its row read from the user-writable index while it runs exactly that AppRun; bound by its sha256.
 *  PURE, imports nothing; one line in src/app-kinds/index.js (lane dc-app-kinds). */
/** THE PLAN of an AppImage VibeSpace staged — the machine half's plan body for it, moved verbatim out of src/app-serve.js plan() (lane
 *  dc-app-kinds). `c` = the plan context src/app-serve.js hands every kind (the request p, the machine facts f, the
 *  index, the nonce, the runner, the simulations, `ret` …); answers THE plan or a named refusal. */
async function planner(c) {
  const { p, f, kind, manifest, ret, A, rootEntries, stagedFile, appImageInfo, stageIcon } = c;
  const sf = await stagedFile(p, '.AppImage');
  if (sf.error) return ret({ ...sf.error, kind });
  let info;
  try { info = await appImageInfo(sf.file); } catch (e) { return ret({ ok: false, code: ['unsupported', 'hostile', 'too_large'].includes(e.code) ? e.code : 'unreadable', error: String(e.message || e), kind }); }
  const disk = A.diskVerdict({ homeFree: f.homeFree, downloadBytes: info.bytes });
  if (disk) return ret({ ok: false, ...disk, kind });
  const label = info.app ? info.app.name : String(p.name || 'app').replace(/\.AppImage$/i, '').slice(0, 80);
  const prev = manifest.entries.find((e) => e.kind === 'appimage' && e.label === label);
  const entryId = prev ? prev.id : A.entryIdFor((info.app && info.app.stem) || label, [...(await rootEntries()).map((e) => e.id), ...manifest.entries.map((e) => e.id)]);
  const icon = info.icon ? await stageIcon(info.icon.bytes, p.staged) : null;
  return ret({ ok: true, code: null, error: null, canRun: true, kind, mode: 'appimage', entryId, source: 'download', packages: [], closure: [], closureKey: `appimage ${p.sha256} ${entryId}`, newCount: 0, upgradeCount: 0, downloadBytes: sf.size, installedBytes: info.bytes, origins: [], stagedName: p.staged, sha256: p.sha256, app: info.app ? { ...info.app, icon } : null, label, files: info.files,
    commands: [`# VibeSpace unpacks the AppImage (sha256 ${p.sha256}) into ~/.vibespace/apps/appimage/${entryId}/ as you — nothing runs as root, the AppImage itself is not run`, '# its own desktop file becomes its row in Apps; the downloaded file is deleted once it is unpacked'] });
}

/** The record reader (app-manifest normEntry): the AppImage's sha256, name and origin when the index carries them. */
const record = (e, { isObj, str, num, SHA256_RE }) => (isObj(e.appimage) && SHA256_RE.test(String(e.appimage.sha256 || '')) ? { appimage: { sha256: e.appimage.sha256, name: str(e.appimage.name, 200), size: num(e.appimage.size), from: str(e.appimage.from, 300) } } : null);
/** A request: only by its address or file (an installer request — VibeSpace stages it itself). */
const requestOf = () => ({ ok: false, code: 'bad-request', error: 'name the AppImage by its address or file' });

module.exports = Object.freeze({ id: 'appimage', entry: 'home', plan: true, request: true, agent: true, cliWord: 'appimage', card: 'appimage', keeps: 'home', from: 'download', staged: 'AppImage', word: 'AppImage',
  unpacked: true, planner, record, requestOf });
