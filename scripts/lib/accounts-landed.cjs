'use strict';
// B-574d unit 1 (a) (lane lg-store-writes, 主开发 r3455 / r3486): accounts.json is written by THE STORE WRITER (src/accounts.js
// _save: dirty + durable, on the writer's thread). A SUITE that reads the file right after an act, or opens a second manager over the
// same folder (a restart), waits for each save here: the store writer's synchronous flush of that one file, on the SUITE's thread —
// never the hub's loop (the hub's door is src/server/account-usage-routes.js answerAfterLanding). The bytes on disk are the
// product's own write. `waitEverySave(AccountManager)` patches the class ONCE (a mutant copy's class is patched by its own call).
const path = require('path');
const SW = require(path.join(__dirname, '..', '..', 'src', 'store-writer.js'));

function waitEverySave(AM) {
  if (!AM || !AM.prototype || typeof AM.prototype._save !== 'function' || AM.prototype._saveWaited) return AM;
  const save0 = AM.prototype._save;
  AM.prototype._save = function (...a) {
    const r = save0.apply(this, a);
    let left = null;
    try {
      const W = typeof this._writer === 'function' ? this._writer() : SW.storeWriter();
      const f = W.flushSync([this._file], { waitedBy: 'a suite: accounts.json read right after an act' });
      left = f && Array.isArray(f.left) ? f.left.find((x) => x && x.file === this._file) : null;
    } catch { left = null; }
    // r3763 (the should): a flush that leaves the file OWED while the list is not held is a failing write, never silence — the suite
    // fails by name (a held list writes nothing: nothing to wait for)
    let held = null; try { held = typeof this.held === 'function' ? this.held() : null; } catch { held = null; }
    if (left && !held) throw new Error(`accounts.json was not written (${left.why || 'the store writer left it owed'}) — the suite's save could not land`);
    return r;
  };
  Object.defineProperty(AM.prototype, '_saveWaited', { value: true });
  return AM;
}

module.exports = { waitEverySave };
