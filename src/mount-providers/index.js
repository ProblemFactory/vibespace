// src/mount-providers/index.js — THE registration list of the storage providers (rv-server M6, lane dc-mount-providers).
// A provider is ONE file here (a PURE row: facts + its hooks into MountManager's generic lifecycle) and ONE line
// below; src/mounts.js gates on a row's DECLARED cells / hooks and names no provider. The order is the order rows are
// asked in (a raw rclone record is adopted by the first row whose `adopts` claims its backend).
'use strict';
const ROWS = [
  require('./s3.js'),
  require('./drive.js'),
  require('./gmail.js'),
  require('./onedrive.js'),
  require('./cloud.js'),
  require('./webdav.js'),
  require('./vibespace.js'),
  require('./sftp.js'),
  require('./rclone.js'),
  require('./cephfs.js'),
];

const byId = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(ROWS.map((r) => [r.id, r]))));   // no prototype: a type named `constructor` has no row
const NONE = Object.freeze({});
const defaultRow = ROWS.find((r) => r.default);
/** A record's row: a record without a type is the default row's; an unknown type has none (`{}` — every cell absent). */
const rowOf = (type) => byId[type || defaultRow.id] || NONE;

/** The rows' CLIENT cells (lane dc-mount-client), published once by GET /api/mounts as `providers`: pure data the
 *  sidebar + the storage dialogs render from (src/lib/sidebar-mounts.js names no provider). */
const clientRows = () => ROWS.map((r) => ({ id: r.id, default: !!r.default, oauth: r.oauth || null, ...(r.client || {}) }));

module.exports = { rows: ROWS, byId, rowOf, defaultRow, clientRows };
