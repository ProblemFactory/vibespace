// DeviceMounts (2.153.0) — mount a PAIRED DIAL-OUT DEVICE's folder into THIS
// VibeSpace (the forward direction of device-folder-mount, giving pairing its
// first real utility: your NAT'd Mac's folder appears as a local dir here).
// Mechanism: the device's daemon serves the folder over WebDAV on its own
// loopback (serve-folder), we tcp-forward it through the dial link and
// rclone-webdav-mount it read-only (src/device-mount.js — 7ms reads, no
// public address, no ssh).
//
// Persistence: data/device-mounts.json records intent; the live chain
// (serve-folder + bridge + rclone) is in-memory only — a server restart or a
// device redial drops it, and `onDeviceDialedIn` / `restore` REMOUNT every
// recorded mount whose device is reachable (auto-heal, same spirit as
// host-mounts' re-own). A mount whose device is offline stays recorded and
// pending (row shows it), healing on the next dial-in.
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { deviceFolderMount } = require('./device-mount');

class DeviceMounts {
  /** @param deps { deviceForDial:(id)=>Promise<DeviceManager>, isOnline:(id)=>boolean, rcloneBin:()=>string, broadcast:(msg)=>void } */
  constructor({ dataDir, deviceForDial, isOnline, rcloneBin, broadcast, log }) {
    this.dataDir = dataDir;
    this.deviceForDial = deviceForDial;
    this.isOnline = isOnline || (() => false);
    this.rcloneBin = rcloneBin;
    this.broadcast = broadcast || (() => {});
    this.log = log || (() => {});
    this._file = path.join(dataDir, 'device-mounts.json');
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { this._state = { mounts: [] }; }
    this._live = new Map(); // rec.id → { teardown }
    this._mounting = new Set(); // rec.id (single-flight)
  }

  _save() { fs.writeFileSync(this._file, JSON.stringify(this._state, null, 2)); }

  list() {
    return this._state.mounts.map((m) => ({
      ...m,
      live: this._live.has(m.id),
      online: this.isOnline(m.deviceId),
    }));
  }

  async mount(deviceId, { remotePath, mountpoint } = {}) {
    if (!remotePath || !String(remotePath).startsWith('/')) throw new Error('remotePath must be absolute (a folder ON the device)');
    const mp = mountpoint || path.join(os.homedir(), 'vibespace-devices', `${deviceId}-${path.basename(remotePath) || 'root'}`);
    let rec = this._state.mounts.find((m) => m.deviceId === deviceId && m.remotePath === remotePath && m.mountpoint === mp);
    if (!rec) {
      rec = { id: 'dvm-' + Math.random().toString(36).slice(2, 10), deviceId, remotePath, mountpoint: mp, createdAt: Date.now() };
      this._state.mounts.push(rec);
      this._save();
    }
    await this._up(rec);
    this.broadcast({ type: 'device-mounts-updated' });
    return { ...rec, live: this._live.has(rec.id) };
  }

  async _up(rec) {
    if (this._live.has(rec.id) || this._mounting.has(rec.id)) return;
    this._mounting.add(rec.id);
    try {
      const device = await this.deviceForDial(rec.deviceId);
      const h = await deviceFolderMount({
        device, remotePath: rec.remotePath, mountpoint: rec.mountpoint,
        rcloneBin: this.rcloneBin(), log: this.log,
      });
      this._live.set(rec.id, h);
      this.log(`device mount up: ${rec.deviceId}:${rec.remotePath} → ${rec.mountpoint}`);
    } finally { this._mounting.delete(rec.id); }
  }

  /** Manual remount (the row's ↻ — e.g. after a failed heal). */
  async remount(id) {
    const rec = this._state.mounts.find((m) => m.id === id);
    if (!rec) throw new Error('unknown device mount');
    if (!this.isOnline(rec.deviceId)) throw new Error('device is offline — start its daemon first');
    const live = this._live.get(id);
    if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
    await this._up(rec);
    this.broadcast({ type: 'device-mounts-updated' });
    return { ...rec, live: this._live.has(id) };
  }

  async unmount(id) {
    const i = this._state.mounts.findIndex((m) => m.id === id);
    if (i < 0) throw new Error('unknown device mount');
    const rec = this._state.mounts[i];
    const live = this._live.get(id);
    if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
    this._state.mounts.splice(i, 1);
    this._save();
    this.broadcast({ type: 'device-mounts-updated' });
    return rec;
  }

  /** A device (re)dialed in — heal its recorded mounts. Fire-and-forget. */
  onDeviceDialedIn(deviceId) {
    for (const rec of this._state.mounts.filter((m) => m.deviceId === deviceId)) {
      this._up(rec).then(() => this.broadcast({ type: 'device-mounts-updated' }))
        .catch((e) => this.log(`device mount heal failed (${rec.mountpoint}): ${e.message}`));
    }
  }

  /** Boot: try every recorded mount whose device is already dialed in. */
  restore() {
    for (const rec of this._state.mounts) {
      if (this.isOnline(rec.deviceId)) this.onDeviceDialedIn(rec.deviceId);
    }
  }

  /** A device was unpaired — drop its mounts (records + live chains). */
  async onDeviceUnpaired(deviceId) {
    for (const rec of [...this._state.mounts.filter((m) => m.deviceId === deviceId)]) {
      try { await this.unmount(rec.id); } catch { }
    }
  }
}

module.exports = { DeviceMounts };
