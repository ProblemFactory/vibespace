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
const pinUnusable = (h) => (!carriesPin(h) ? null : !pinned(h) ? 'its pinned keys are not ssh host keys' : pinWhy(h));
/** …refused BY NAME (`host-key-name`), never «host key changed», with its door: an address is not edited in place — the
 *  machine is removed and added again with its plain address. */
const NAME_DOOR = 'Remote → {machine} → Remove host, then Remote → Add machine';
function pinRefusal(h, why) {
  const who = h.name || h.id || 'a machine';
  return Object.assign(new Error(`${who}: its host-key pin cannot be used — ${why}, so VibeSpace does not connect to it. Remove it and add it again with its plain address (${NAME_DOOR.replace('{machine}', who)})`), { code: 'host-key-name', hostId: h.id || null, host: who });
}

/** Write (or heal) a pinned record's file — 0600 in a 0700 folder, through a temporary name. Unpinned ⇒ removed. */
function writePinFile(sshDir, h) {
  const f = pinFileOf(sshDir, h.id);
  // a pin that cannot be used (pinUnusable) is never written: its file goes and the refusal is said (the caller's log / warning)
  const why = pinUnusable(h);
  if (!pinned(h) || why) {
    try { fs.unlinkSync(f); } catch { /* none */ }
    if (why) throw pinRefusal(h, why);
    return null;
  }
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  const text = pinText(h);
  let now = null; try { now = fs.readFileSync(f, 'utf8'); } catch { /* absent */ }
  if (now === text) return f;
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, f);
  return f;
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
/** The refusal BY NAME (`host-key-changed`) for a record, or null. */
function hostKeyRefusal(h, stderr) {
  const unusable = pinUnusable(h);
  if (unusable) return pinRefusal(h, unusable); // ssh's 255 of a record never dialled (its pin cannot be used) — by name
  const w = hostKeyWords(stderr);
  if (!w) return null;
  const name = (h && (h.name || h.id)) || 'the machine';
  const pin = pinned(h);
  const whose = pin ? 'the key pinned for it' : 'the key this VibeSpace saw before';
  // a machine never pinned is not told to pin it «again» (主开发's verdict of 2026-11-18); the door is THE phrase (DOOR)
  const act = pin ? 'pin it again' : 'pin the key it shows now';
  return Object.assign(new Error(`${name} showed an ssh host key that is not ${whose} — VibeSpace did not connect${w.fp ? ` (it showed ${w.fp})` : ''}. If the machine's key really changed, compare it on the machine and ${act} in ${doorOf(name)}`), { code: 'host-key-changed', hostId: (h && h.id) || null, host: name, fp: w.fp, sshLine: w.said, pinned: pin, params: { host: name, fp: w.fp || '' } });
}

/** The page's view of a record's pin (no key text: the fingerprints say it). */
const pinView = (h) => (pinned(h) ? { hostKeys: keysOf(h).map((k) => ({ type: k.type, fp: fingerprintOf(k.key) })), hostKeysAt: h.hostKeysAt || null } : { hostKeys: null });

module.exports = { fingerprintOf, pinFileOf, pinned, aliasOf, namesOf, pinText, aliasWhy, pinWhy, nameWhy, pinUnusable, pinRefusal, NAME_DOOR, DOOR, writePinFile, hostKeyOpts, scanOpts, keysOfScan, hostKeyWords, hostKeyRefusal, pinView, HOSTKEY_RE };
