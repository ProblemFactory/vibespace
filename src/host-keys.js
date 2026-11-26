/**
 * THE SSH HOST-KEY PIN OF A MACHINE (lane lg-remote-hardening, B-7f0b — design q-042 D6, approved by the owner 2026-10-19).
 *
 * A machine record with no pin is dialled as it always was: StrictHostKeyChecking=accept-new over the hub user's own
 * known_hosts, so the first key ssh meets is trusted. PINNING = the person looks at the key the machine shows NOW and
 * confirms it:
 *   - scanArgs: one fresh ssh over the record's own road (port, key, tailnet name, the user's ssh config), with a
 *     scratch known_hosts. ssh writes the host key there at key exchange, before any login, so a refused login still
 *     shows it; no master is ridden or left.
 *   - the record then carries `hostKeys` [{type, key, fp}] (`hostKeysAt`).
 *   - EVERY ssh of that record runs StrictHostKeyChecking=yes over data/ssh/known_hosts.d/<id> ALONE (no /etc file, not
 *     the hub user's file): hostKeyOpts.
 *   - a different key is refused by NAME, `host-key-changed` (hostKeyRefusal), with the fingerprint the machine showed.
 * ssh reads `~` from the passwd entry, never $HOME — every test of this road hands ssh its own files.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SKF = require('./ssh-key-format.js');
const FC = require('./fd-close.js');   // B-574d (lane nl-paired): a pin file's bytes on disk before its name (the synced replace)
/** a file system that does no sync at all: said ONCE a run in the hub's journal (the site's name, the code — no path); the pin still lands */
let noSyncSaid = false;
const sayNoSync = (l) => { if (noSyncSaid) return; noSyncSaid = true; console.warn(`[hosts] ${l}`); };

/** ssh's own fingerprint of a public key (base64 of its wire blob): `SHA256:<base64, no padding>`. */
const fingerprintOf = (b64) => 'SHA256:' + crypto.createHash('sha256').update(Buffer.from(String(b64 || ''), 'base64')).digest('base64').replace(/=+$/, '');
/** The pin file of one record: data/ssh/known_hosts.d/<id>. */
const pinFileOf = (sshDir, id) => path.join(sshDir, 'known_hosts.d', String(id).replace(/[^\w.-]/g, '_'));
/** the record's pinned keys RE-JUDGED (an imported bundle, a hand-edited hosts.json) by THE judge unit 1's paste uses
 *  (SKF.isHostKey: a known type, a base64 key whose own bytes name it) — nothing else reaches the file (a newline in `key` would
 *  add any line), the fingerprint always recomputed */
const keysOf = (h) => (h && Array.isArray(h.hostKeys) ? h.hostKeys : []).filter((k) => k && SKF.isHostKey(k.type, k.key));
const pinned = (h) => keysOf(h).length > 0;
/** The ONE name a pinned record is looked up by: its HostKeyAlias = the host as typed, lowercased (an alias looks up WITHOUT
 *  the port). Handed to ssh with the pin, so neither the hub user's ssh config (a `Host` alias, a HostName / Port rewrite)
 *  nor a tailnet IP can move the lookup off the lines the pin file holds. */
const aliasOf = (h) => String((h && h.host) || '').trim().toLowerCase();
const namesOf = (h) => [aliasOf(h)].filter(Boolean);
/** The pin file's text: every pinned key under the record's alias. */
const pinText = (h) => keysOf(h).map((k) => `${aliasOf(h)} ${k.type} ${k.key}\n`).join('');
/** The door a person follows to a machine's pin — ONE phrase, in the refusal and in the For-you item (src/server/host-key-watch.js
 *  says the same words): the sidebar's Remote tab, the machine's row, its key button (主开发's verdict of 2026-11-18). */
const DOOR = 'Remote → {machine} → Host key…';
const doorOf = (name) => DOOR.replace('{machine}', name);
/** 主开发's verdict of 2026-11-18: the alias (the host as typed) is written as the pin line's NAME — whitespace or a control
 *  character there would end the name early or start another line of the file. → why no pin can name the record | null */
function aliasWhy(h) {
  const a = aliasOf(h);
  if (!a) return 'it has no address a pin could name';
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(a)) return 'its address holds a space or a control character';
  return null;
}
/** …and the file's text is read back by THE parser (SKF.parseKnownHosts, unit 1's) as exactly the record's keys, each under the
 *  one alias — a comma, a `!`, a wildcard or a marker in the address is refused there. → why the pin cannot be written | null */
function pinWhy(h) { return nameWhy(h); }
/** THE NAME, judged by THE parser on one line under the alias with a sample key built here (a key count or a file's size is
 *  no address problem; the scan of a record with no key yet is judged the same way — the reader of unit 3). → why not | null */
const SAMPLE_KEY = (() => { const t = Buffer.from('ssh-ed25519'), b = Buffer.alloc(8 + t.length + 32); b.writeUInt32BE(t.length, 0); t.copy(b, 4); b.writeUInt32BE(32, 4 + t.length); return b.toString('base64'); })();
function nameWhy(h) {
  const why = aliasWhy(h);
  if (why) return why;
  const a = aliasOf(h), p = SKF.parseKnownHosts(`${a} ssh-ed25519 ${SAMPLE_KEY}\n`);
  if (!p.ok || p.keys.length !== 1 || p.keys[0].hashed.length || !p.keys[0].names || p.keys[0].names.length !== 1 || p.keys[0].names[0] !== a) return 'its address is not one plain host name (a comma, a !, a wildcard or a marker)';
  return null;
}
/** 主开发's ruling of 2026-11-18: a PINNED record whose address no pin line can name (an imported bundle, a hand-edited
 *  hosts.json — the pin act refuses one first) → why its pin cannot be used | null */
// …and a record that CARRIES hostKeys none of which is an ssh key (an imported bundle) is never silently unpinned (accept-new)
const carriesPin = (h) => !!(h && Array.isArray(h.hostKeys) && h.hostKeys.length);
const pinUnusable = (h) => (!carriesPin(h) ? hopUnusable(h) : !pinned(h) ? 'its pinned keys are not ssh host keys' : pinWhy(h) || hopUnusable(h));

// ── THE JUMP HOST's PIN (lane lg-remote-hardening, B-7f0b's remainder — 主开发 r3431; the owner's side's standing ruling: nothing
// pins by itself at an update). A machine behind a jump host is reached through OUR ssh to the bastion (src/hosts.js jumpArgsOf's
// ProxyCommand). Its record may carry `jumpHostKeys` [{type, key, fp}] (`jumpHostKeysAt`), pinned by the PERSON as the machine's
// own keys are (its Host key… dialog, or the row's one press — one press pins both): the hop is then dialled
// StrictHostKeyChecking=yes over data/ssh/known_hosts.jump.d/<id> ALONE, under the hop's own alias. A record without them dials
// its hop exactly as at the release (accept-new into the hub user's own known_hosts), and its row says the hop is not pinned.
const { jumpVerdict, jumpParts } = require('./ssh-config-block.js');
/** the record's hop {user, host, port} | null (no jump host, or one no verdict admits — that record is refused before any dial) */
function hopOf(h) {
  if (!h || h.jump == null) return null;
  const j = jumpVerdict(h.jump);
  return j && j.ok && j.jump ? jumpParts(j.jump) : null;
}
/** the ONE name the hop is looked up by: its host as typed, lowercased (jumpVerdict admits plain host characters only) */
const hopAliasOf = (h) => { const p = hopOf(h); return p ? String(p.host || '').trim().toLowerCase() : ''; };
const hopKeysOf = (h) => (h && Array.isArray(h.jumpHostKeys) ? h.jumpHostKeys : []).filter((k) => k && SKF.isHostKey(k.type, k.key));
const hopPinned = (h) => !!hopAliasOf(h) && hopKeysOf(h).length > 0;
/** a record that CARRIES jumpHostKeys it cannot use is never silently dialled accept-new: → why | null (pinUnusable says it) */
const hopUnusable = (h) => (!(h && Array.isArray(h.jumpHostKeys) && h.jumpHostKeys.length) ? null
  : !hopAliasOf(h) ? 'its jump host key is pinned for no jump host it has' : !hopPinned(h) ? 'its jump host\'s pinned keys are not ssh host keys' : null);
/** The hop's pin file: data/ssh/known_hosts.jump.d/<id> (its own folder: no record's id can name it). */
const hopPinFileOf = (sshDir, id) => path.join(sshDir, 'known_hosts.jump.d', String(id).replace(/[^\w.-]/g, '_'));
const hopPinText = (h) => hopKeysOf(h).map((k) => `${hopAliasOf(h)} ${k.type} ${k.key}\n`).join('');
/** The ssh options of the HOP's host-key check — words of the ProxyCommand the hub's shell runs (the path in single quotes with
 *  ssh's own double quotes inside: a data dir with a space). Unpinned ⇒ exactly as at the release. */
function hopKeyOpts(sshDir, h) {
  if (!hopPinned(h)) return ['-o', 'StrictHostKeyChecking=accept-new'];
  const f = hopPinFileOf(sshDir, h.id).replace(/'/g, "'\\''");
  return ['-o', 'StrictHostKeyChecking=yes', '-o', `HostKeyAlias=${hopAliasOf(h)}`, '-o', `'UserKnownHostsFile="${f}"'`, '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'UpdateHostKeys=no'];
}
/** …refused BY NAME (`host-key-name`), never «host key changed», with its door: an address is not edited in place — the
 *  machine is removed and added again with its plain address. */
const NAME_DOOR = 'Remote → {machine} → Remove host, then Remote → Add machine';
function pinRefusal(h, why) {
  const who = h.name || h.id || 'a machine';
  return Object.assign(new Error(`${who}: its host-key pin cannot be used — ${why}, so VibeSpace does not connect to it. Remove it and add it again with its plain address (${NAME_DOOR.replace('{machine}', who)})`), { code: 'host-key-name', hostId: h.id || null, host: who });
}

/** Write (or heal) a pinned record's file — 0600 in a 0700 folder, through a temporary name SYNCED before its rename. Unpinned ⇒ removed.
 *  B-574d (lane nl-paired, 主开发 r4752): ITS BYTES ARE ON DISK BEFORE ITS NAME — the tree's one synced replace (src/fd-close.js
 *  renameSynced). Its reader is ssh, a CHILD process, at the record's very next connection, so the write is synchronous, never queued;
 *  a rare write (a person's pin or unpin, an import, the boot heal of a file whose text differs). Before, a power loss after the
 *  rename could leave the name on an empty file: a strict check over no key, every connection refused until the next start's heal.
 *  A sync or close that FAILS is a failed write THROWN to the caller (its try says the pin was not written), the temp removed, the
 *  old file standing; only a file system with no sync at all lands, said once a run. */
function writePinFile(sshDir, h) {
  // a pin that cannot be used (pinUnusable) is never written: its files go and the refusal is said (the caller's log / warning).
  // r3431: the HOP's file and the machine's, each following the record — ONE writer, a temporary name for each
  const why = pinUnusable(h);
  const files = [[hopPinFileOf(sshDir, h.id), !why && hopPinned(h) ? hopPinText(h) : null], [pinFileOf(sshDir, h.id), !why && pinned(h) ? pinText(h) : null]];
  for (const [f, text] of files) {
    if (text === null) { try { fs.unlinkSync(f); } catch { /* none */ } continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    let now = null; try { now = fs.readFileSync(f, 'utf8'); } catch { /* absent */ }
    if (now === text) continue;
    const tmp = f + '.' + process.pid + '.tmp';
    FC.renameSynced(tmp, f, text, { mode: 0o600, where: 'a host-key pin file', say: sayNoSync });
  }
  if (why) throw pinRefusal(h, why);
  return files[1][1] === null ? null : files[1][0];
}

/** The ssh options of one record's host-key check (in front of every other option: ssh keeps the FIRST value). */
function hostKeyOpts(sshDir, h) {
  if (!pinned(h) && !pinUnusable(h)) return ['-o', 'StrictHostKeyChecking=accept-new'];
  // 主开发's ruling of 2026-11-18: a pin no line can name has NO file — that record is never dialled (the proxy command ends
  // before any connection; no master is ridden), never downgraded to unpinned (strict over an empty file), and every road that
  // words ssh's exit names it (hostKeyRefusal ⇒ host-key-name). Never a throw here: sshArgs runs in ~34 places, some in event
  // handlers, where a throw would end the hub.
  if (pinUnusable(h)) return ['-o', 'ProxyCommand=false', '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'UpdateHostKeys=no'];
  // ssh splits an option's value on spaces: the path rides in double quotes (a data dir with a space)
  // UpdateHostKeys=no: a user config's `UpdateHostKeys yes` would append the server's other keys to the pin file
  return ['-o', 'StrictHostKeyChecking=yes', '-o', `HostKeyAlias=${aliasOf(h)}`, '-o', `UserKnownHostsFile="${pinFileOf(sshDir, h.id)}"`, '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'UpdateHostKeys=no'];
}

/** The scan's own options: accept the key into a SCRATCH file, a fresh connection (never a master), no prompt. */
// the reader's note 13: the key is captured at key exchange, so the scan attempts NO login — no key, no agent, no password,
// no GSSAPI or host-based method (the two a user's ssh_config could still turn on — 主开发's verdict of 2026-11-18), no
// forwarding of anything to a machine nobody confirmed yet
// — of the DESTINATION: a machine behind a jump host (B-2ca0) is reached through the hop, which is the hub's own ssh to the bastion
// (its login, and accept-new into the hub user's known_hosts), as that machine's first dial would be
const scanOpts = (scratchFile) => ['-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile="${scratchFile}"`, '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'UpdateHostKeys=no',
  '-o', 'PubkeyAuthentication=no', '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no', '-o', 'GSSAPIAuthentication=no', '-o', 'HostbasedAuthentication=no', '-o', 'IdentityAgent=none', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no'];

/** The scratch file after a scan → the keys it learned [{type, key, fp}] (names ignored: they are the scan's own). */
function keysOfScan(text) {
  const p = SKF.parseKnownHosts(text);
  if (!p.ok) return [];
  const seen = new Set(), out = [];
  for (const k of p.keys) { const id = k.type + ' ' + k.key; if (seen.has(id)) continue; seen.add(id); out.push({ type: k.type, key: k.key, fp: fingerprintOf(k.key) }); }
  return out;
}

/** ssh's words for a key it would not trust → {fp, said} | null. Pinned or not: a changed key in the hub user's own file
 *  (the unpinned road) is the same refusal. */
const HOSTKEY_RE = /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|host key for \S+ has changed|No \S+ host key is known for/i;
function hostKeyWords(stderr) {
  const t = String(stderr || '');
  if (!HOSTKEY_RE.test(t)) return null;
  const lines = t.split('\n').map((x) => x.trim());
  const said = lines.find((x) => /^(?:\S+ )?host key for \S+ has changed|^No \S+ host key is known for/i.test(x)) || lines.find((x) => HOSTKEY_RE.test(x)) || 'Host key verification failed';
  const fp = /key sent by the remote host is\s+(SHA256:[A-Za-z0-9+/=]{20,64})/.exec(t);
  return { fp: fp ? fp[1] : null, said: said.slice(0, 200) };
}
/** r3873 (1): ssh's word for a key's type in «No <TYPE> host key is known for …» → the key types that word names */
const SSH_TYPE_NAMED = Object.freeze({ RSA: ['ssh-rsa'], DSA: ['ssh-dss'], ECDSA: ['ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'], ED25519: ['ssh-ed25519'], 'ECDSA-SK': ['sk-ecdsa-sha2-nistp256@openssh.com'], 'ED25519-SK': ['sk-ssh-ed25519@openssh.com'] });
/** The refusal BY NAME (`host-key-changed`) for a record, or null. */
const nameOfSaid = (said) => { const m = /host key for (\S+) has changed|host key is known for (\S+)/i.exec(String(said || '')); return String(m ? (m[1] || m[2]) : '').replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').toLowerCase(); };
function hostKeyRefusal(h, stderr) {
  const unusable = pinUnusable(h);
  if (unusable) return pinRefusal(h, unusable); // ssh's 255 of a record never dialled (its pin cannot be used) — by name
  const w = hostKeyWords(stderr);
  if (!w) return null;
  const name = (h && (h.name || h.id)) || 'the machine';
  // r3688 + r3873 (1): under a PINNED check ssh says «No <TYPE> host key is known for <alias>» in two cases. The pin FILE lacks the
  // line (removed or emptied by hand): the record pins a key of that very TYPE, which an intact file would hold — said as that
  // (pinLine 'none'), the same door. Or the host now shows a key of ANOTHER type than the pinned one (reinstalled without it, or
  // somebody in the middle offering only another type): a CHANGED key, its warning and its door — never «a start writes it again»
  const noLineT = /^No (\S+) host key is known for/i.exec(w.said);
  // r3966: ssh's ONE word names every key type of its family — ECDSA is three curves — so a host that moved from one curve to another
  // (nistp256 → nistp384) prints the very sentence of a missing line: the no-line words only when the record pins EVERY type the word
  // names (one type for each other word); any other case is a changed key, its warning and its door
  const noLineOf = (keys) => { const named = noLineT ? SSH_TYPE_NAMED[noLineT[1].toUpperCase()] || [] : []; return named.length > 0 && named.every((ty) => keys.some((k) => k.type === ty)); };
  // r3431: the key ssh refused was the JUMP HOST's (the line names the hop, never the machine) — said as the hop's, its door the same
  const hop = hopAliasOf(h);
  if (hop && hop !== aliasOf(h) && nameOfSaid(w.said) === hop) {
    const hp = hopPinned(h), jh = hopOf(h).host;
    if (hp && noLineOf(hopKeysOf(h))) return Object.assign(new Error(`${name}'s jump host ${jh}: the file that holds the key pinned for it has no line for it, so ssh had no key to check — VibeSpace did not connect. A start of VibeSpace writes it again from the record; or pin it again in ${doorOf(name)}`),
      { code: 'host-key-changed', hostId: (h && h.id) || null, host: name, fp: null, sshLine: w.said, pinned: true, pinLine: 'none', jump: jh, params: { host: name, fp: '', jump: jh, pinLine: 'none' } });
    return Object.assign(new Error(`${name}'s jump host ${jh} showed an ssh host key that is not ${hp ? 'the key pinned for it' : 'the key this VibeSpace saw before'} — VibeSpace did not connect${w.fp ? ` (it showed ${w.fp})` : ''}. If the jump host's key really changed, compare it on the jump host and ${hp ? 'pin it again' : 'pin the key it shows now'} in ${doorOf(name)}`),
      { code: 'host-key-changed', hostId: (h && h.id) || null, host: name, fp: w.fp, sshLine: w.said, pinned: hp, jump: jh, params: { host: name, fp: w.fp || '', jump: jh } });
  }
  const pin = pinned(h);
  const whose = pin ? 'the key pinned for it' : 'the key this VibeSpace saw before';
  // a machine never pinned is not told to pin it «again» (主开发's verdict of 2026-11-18); the door is THE phrase (DOOR)
  const act = pin ? 'pin it again' : 'pin the key it shows now';
  if (pin && noLineOf(keysOf(h))) return Object.assign(new Error(`${name}: the file that holds the key pinned for it has no line for it, so ssh had no key to check — VibeSpace did not connect. A start of VibeSpace writes it again from the record; or pin it again in ${doorOf(name)}`), { code: 'host-key-changed', hostId: (h && h.id) || null, host: name, fp: null, sshLine: w.said, pinned: true, pinLine: 'none', params: { host: name, fp: '', pinLine: 'none' } });
  return Object.assign(new Error(`${name} showed an ssh host key that is not ${whose} — VibeSpace did not connect${w.fp ? ` (it showed ${w.fp})` : ''}. If the machine's key really changed, compare it on the machine and ${act} in ${doorOf(name)}`), { code: 'host-key-changed', hostId: (h && h.id) || null, host: name, fp: w.fp, sshLine: w.said, pinned: pin, params: { host: name, fp: w.fp || '' } });
}

/** The page's view of a record's pin (no key text: the fingerprints say it). */
const pinView = (h) => ({ ...pinViewOwn(h), ...hopView(h) });
/** r3431: the hop's part of the view — its host, and its pinned keys' fingerprints (null: the jump host's key is not pinned) */
// r3688 (line 814's round, must 1): the hop's view rides under a NAME OF ITS OWN (jumpPin) — a record's own fields are never replaced by
// a view's: hosts.list() spreads this view last, and a row's `jump` stays the record's string (a list row dials as its record does)
const hopView = (h) => { const p = hopOf(h); return !p ? {} : { jumpPin: { host: p.host, port: p.port || null, hostKeys: hopPinned(h) ? hopKeysOf(h).map((k) => ({ type: k.type, fp: fingerprintOf(k.key) })) : null, hostKeysAt: hopPinned(h) ? (h.jumpHostKeysAt || null) : null, ...(hopUnusable(h) ? { hostKeysUnusable: true } : {}) } }; };
const pinViewOwn = (h) => (pinned(h) ? { hostKeys: keysOf(h).map((k) => ({ type: k.type, fp: fingerprintOf(k.key) })), hostKeysAt: h.hostKeysAt || null } : pinUnusable(h) ? { hostKeys: null, hostKeysUnusable: true } : { hostKeys: null });   // r1602: a REFUSED pin is not «not pinned» (no one-press for it)

/** B-7f0b (the coordinator's r1220 (2)): THE KEYS THIS HUB ALREADY TRUSTS for a record — the hub user's own known_hosts lines
 *  (ssh's accept-new wrote them at the machine's first dial), under the name ssh looks the record up by (`host`, or `[host]:port`
 *  off port 22; a hashed name matched by its HMAC). Read async within KNOWN_FILE_MAX; EACH LINE judged alone by THE parser (a
 *  marker, a wildcard or a bad line elsewhere in the file costs no other line its read, and is never a pin). No new trust: nothing
 *  is asked of the machine. → [{type, key, fp}] ([] when the hub trusts no key for it, or has no such file)
 *  r1602 (the round wd8wo8si8's musts): A KEY THE FILE REVOKES IS NEVER PINNED — a key named by ANY `@revoked` line of the file,
 *  whatever its host pattern, is left out; what is left decides (none ⇒ the caller's refusal by name). A file over the bound or one
 *  that cannot be read is refused by its own code (host-key-known-too-big / host-key-known-unreadable), never «no key yet», and
 *  never with the file's path in its words. */
const KNOWN_FILE_MAX = 4 * 1024 * 1024;
const knownRefusal = (code, why) => Object.assign(new Error(why), { code });
/** the keys the file's `@revoked` lines name (any host pattern: `@revoked * ssh-ed25519 K` revokes K for every host) */
// The key's base64 blob names its own type (its first field), so comparing the blob compares the type and the key. Only THIS
// file's revocations are read (the hub user's known_hosts): known_hosts2, /etc/ssh/ssh_known_hosts and a configuration's own
// UserKnownHostsFile are not read here, so a revocation set only there is not seen by the press.
function revokedKeysOf(text) {
  const out = new Set();
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!/^@revoked\s/i.test(t)) continue;
    const f = t.split(/\s+/);
    const at = f.findIndex((x, i) => i > 0 && SKF.HOST_KEY_TYPES.includes(x));
    if (at > 0 && f[at + 1]) out.add(f[at + 1]);
  }
  return out;
}
async function knownKeysOf(h, { file } = {}) {
  const port = Number(h && h.port) || 22;
  const want = SKF.knownHostName(port !== 22 ? `${aliasOf(h)}:${port}` : aliasOf(h));
  if (!want || !file) return [];
  let text = '';
  try {
    const fh = await fs.promises.open(file, 'r');
    try { const b = Buffer.alloc(KNOWN_FILE_MAX + 1); const { bytesRead } = await fh.read(b, 0, b.length, 0); if (bytesRead > KNOWN_FILE_MAX) throw knownRefusal('host-key-known-too-big', `this hub's known_hosts file is over ${KNOWN_FILE_MAX / 1048576} MiB, so it is not read for a pin`); text = b.subarray(0, bytesRead).toString('utf-8'); }
    finally { await fh.close(); }
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    if (e && e.code === 'host-key-known-too-big') throw e;
    throw knownRefusal('host-key-known-unreadable', `this hub's known_hosts file could not be read (${(e && e.code) || 'an error'})`);   // the code only: never the path
  }
  const revoked = revokedKeysOf(text);
  const out = [], had = new Set();
  for (const line of text.split('\n')) {
    const p = SKF.parseKnownHosts(line + '\n');
    if (!p.ok || p.keys.length !== 1) continue;
    const k = p.keys[0];
    if (revoked.has(k.key)) continue;   // r1602 (1): revoked anywhere in the file ⇒ never this machine's pin
    const hit = (k.names || []).includes(want) || (k.hashed || []).some(({ salt, hash }) => { try { return crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(want).digest('base64') === hash; } catch { return false; } });
    if (!hit || had.has(k.type + ' ' + k.key)) continue;
    had.add(k.type + ' ' + k.key);
    out.push({ type: k.type, key: k.key, fp: fingerprintOf(k.key) });
  }
  return out;
}

module.exports = { hopOf, hopAliasOf, hopKeysOf, hopPinned, hopUnusable, hopPinFileOf, hopPinText, hopKeyOpts, hopView, knownKeysOf, revokedKeysOf, KNOWN_FILE_MAX, fingerprintOf, pinFileOf, pinned, aliasOf, namesOf, pinText, aliasWhy, pinWhy, nameWhy, pinUnusable, pinRefusal, NAME_DOOR, DOOR, writePinFile, hostKeyOpts, scanOpts, keysOfScan, hostKeyWords, hostKeyRefusal, pinView, HOSTKEY_RE };
