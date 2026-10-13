# fixture (lane app-display-secrets): libsecret (gi Secret) against whatever DBUS_SESSION_BUS_ADDRESS names — store / lookup / search / delete / unlock; prints one JSON line per step
import sys, time, json, gi
gi.require_version('Secret', '1')
from gi.repository import Secret, GLib
S = Secret.Schema.new('org.vibespace.Test', Secret.SchemaFlags.NONE, {'user': Secret.SchemaAttributeType.STRING, 'site': Secret.SchemaAttributeType.STRING})
def step(name, fn):
    t = time.monotonic()
    try: r = fn(); out = {'step': name, 'ok': True, 'value': r}
    except GLib.Error as e: out = {'step': name, 'ok': False, 'error': '%s: %s' % (e.domain, e.message)}
    out['ms'] = round((time.monotonic() - t) * 1000)
    print(json.dumps(out), flush=True); return out
mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
pw = sys.argv[2] if len(sys.argv) > 2 else 'pw-one'
if mode in ('all', 'store'):
    step('store', lambda: Secret.password_store_sync(S, {'user': 'ann', 'site': 'a.example'}, Secret.COLLECTION_DEFAULT, 'ann at a', pw, None))
if mode in ('all', 'store2'):
    step('store2', lambda: Secret.password_store_sync(S, {'user': 'bob', 'site': 'a.example'}, Secret.COLLECTION_DEFAULT, 'bob at a', 'pw-two', None))
if mode in ('all', 'lookup', 'store', 'store2'):
    step('lookup', lambda: Secret.password_lookup_sync(S, {'user': 'ann', 'site': 'a.example'}, None))
if mode in ('all', 'search', 'store2'):
    step('search', lambda: sorted(i.get_label() for i in Secret.password_search_sync(S, {'site': 'a.example'}, Secret.SearchFlags.ALL | Secret.SearchFlags.UNLOCK | Secret.SearchFlags.LOAD_SECRETS, None)))
    step('search-secrets', lambda: sorted(i.retrieve_secret_sync(None).get_text() for i in Secret.password_search_sync(S, {'site': 'a.example'}, Secret.SearchFlags.ALL | Secret.SearchFlags.LOAD_SECRETS, None)))
if mode in ('all', 'delete'):
    step('delete', lambda: Secret.password_clear_sync(S, {'user': 'ann', 'site': 'a.example'}, None))
    step('lookup-after-delete', lambda: Secret.password_lookup_sync(S, {'user': 'ann', 'site': 'a.example'}, None))
if mode == 'unlock':
    def u():
        svc = Secret.Service.get_sync(Secret.ServiceFlags.OPEN_SESSION | Secret.ServiceFlags.LOAD_COLLECTIONS, None)
        cols = svc.get_collections() or []
        n, _ = svc.unlock_sync(cols, None)
        return {'collections': [c.get_label() for c in cols], 'unlocked': n, 'locked': [c.get_locked() for c in cols]}
    step('unlock', u)
