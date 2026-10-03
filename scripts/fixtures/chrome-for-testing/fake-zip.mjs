// lane chrome-builds-download (design 004): a fake Chrome for Testing build zip for the gates — a STORED zip, unix-made (each
// entry's mode in the external attributes, so a link entry is 0o120777), whose `chrome-linux64/chrome` is a script printing
// `Google Chrome for Testing <version>` (what the real one prints for --version). Hostile entries are planted through `extra`.
import zlib from 'node:zlib';
import crypto from 'node:crypto';
export function mkZip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data || ''), data = e.deflate ? zlib.deflateRawSync(raw) : raw; // verify r1: `deflate` = a compressed entry (the zip-bomb leg)
    const crc = zlib.crc32(raw) >>> 0, mode = e.mode != null ? e.mode : e.name.endsWith('/') ? 0o40755 : 0o100644;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt16LE(e.deflate ? 8 : 0, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt16LE(e.deflate ? 8 : 0, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE((mode * 65536) >>> 0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, data); centrals.push(ch, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
export const chromeZip = (v, { says = v, extra = [], big = 0 } = {}) => mkZip([{ name: 'chrome-linux64/' }, { name: 'chrome-linux64/chrome', data: `#!/bin/sh\necho "Google Chrome for Testing ${says} "\n`, mode: 0o100755 }, { name: 'chrome-linux64/locales/' }, { name: 'chrome-linux64/locales/en-US.pak', data: 'x'.repeat(5000) }, ...(big ? [{ name: 'chrome-linux64/resources.pak', data: crypto.randomBytes(big) }] : []), ...extra]);
