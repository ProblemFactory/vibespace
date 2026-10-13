#!/usr/bin/env python3
# The Secret Service (org.freedesktop.secrets, API 0.2) of ONE app display's private session bus — lane app-display-secrets
# (2026-10-12, B-4a59 piece 4; activated by the bus, desktop-apps secretServicePlan). A basic store that never prompts:
# ONE default collection, always unlocked (Unlock answers the objects, every Prompt path is "/"), sessions `plain` only
# — libsecret asks dh-ietf1024-sha256-aes128-cbc-pkcs7 first and falls back on NotSupported (measured); the bus is a
# 0700 unix socket of the same user, so nothing is gained by encrypting the hop. At rest the items are ONE sealed JSON
# file in the app's 0700 dir, sealed by src/app-secrets-seal.js (node: src/secret-box.js's aes-256-gcm under the
# per-display key the hub derived — handed over in the bus env VS_APP_SECRETS_KEY, removed from this process's env
# before any child starts, NEVER in argv or a log). Nothing about an item (label, attributes, value) is ever logged.
# argv: <store file> <node> <sealer.js>.  Private: org.vibespace.AppSecrets.ForgetAll / Count (the window's ⋯ door).
import json, os, subprocess, sys, time, base64, warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)  # Gio.DBusConnection.register_object (PyGObject 3.50+) — still the API
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib

STORE, NODE, SEALER = sys.argv[1], sys.argv[2], sys.argv[3]
KEY = os.environ.pop('VS_APP_SECRETS_KEY', '')
BASE = '/org/freedesktop/secrets'
COL = BASE + '/collection/login'
ALIAS = BASE + '/aliases/default'
NOT_SUPPORTED, NO_OBJECT, NO_SESSION = 'org.freedesktop.DBus.Error.NotSupported', 'org.freedesktop.Secret.Error.NoSuchObject', 'org.freedesktop.Secret.Error.NoSession'
LABEL, ATTRS = 'org.freedesktop.Secret.Item.Label', 'org.freedesktop.Secret.Item.Attributes'
XML = '''<node>
<interface name="org.freedesktop.Secret.Service">
 <method name="OpenSession"><arg direction="in" type="s"/><arg direction="in" type="v"/><arg direction="out" type="v"/><arg direction="out" type="o"/></method>
 <method name="CreateCollection"><arg direction="in" type="a{sv}"/><arg direction="in" type="s"/><arg direction="out" type="o"/><arg direction="out" type="o"/></method>
 <method name="SearchItems"><arg direction="in" type="a{ss}"/><arg direction="out" type="ao"/><arg direction="out" type="ao"/></method>
 <method name="Unlock"><arg direction="in" type="ao"/><arg direction="out" type="ao"/><arg direction="out" type="o"/></method>
 <method name="Lock"><arg direction="in" type="ao"/><arg direction="out" type="ao"/><arg direction="out" type="o"/></method>
 <method name="GetSecrets"><arg direction="in" type="ao"/><arg direction="in" type="o"/><arg direction="out" type="a{o(oayays)}"/></method>
 <method name="ReadAlias"><arg direction="in" type="s"/><arg direction="out" type="o"/></method>
 <method name="SetAlias"><arg direction="in" type="s"/><arg direction="in" type="o"/></method>
 <property name="Collections" type="ao" access="read"/>
 <signal name="CollectionCreated"><arg type="o"/></signal><signal name="CollectionDeleted"><arg type="o"/></signal><signal name="CollectionChanged"><arg type="o"/></signal>
</interface>
<interface name="org.vibespace.AppSecrets">
 <method name="Count"><arg direction="out" type="u"/></method>
 <method name="ForgetAll"><arg direction="out" type="u"/></method>
</interface>
<interface name="org.freedesktop.Secret.Collection">
 <method name="Delete"><arg direction="out" type="o"/></method>
 <method name="SearchItems"><arg direction="in" type="a{ss}"/><arg direction="out" type="ao"/></method>
 <method name="CreateItem"><arg direction="in" type="a{sv}"/><arg direction="in" type="(oayays)"/><arg direction="in" type="b"/><arg direction="out" type="o"/><arg direction="out" type="o"/></method>
 <property name="Items" type="ao" access="read"/><property name="Label" type="s" access="readwrite"/><property name="Locked" type="b" access="read"/>
 <property name="Created" type="t" access="read"/><property name="Modified" type="t" access="read"/>
 <signal name="ItemCreated"><arg type="o"/></signal><signal name="ItemDeleted"><arg type="o"/></signal><signal name="ItemChanged"><arg type="o"/></signal>
</interface>
<interface name="org.freedesktop.Secret.Item">
 <method name="Delete"><arg direction="out" type="o"/></method>
 <method name="GetSecret"><arg direction="in" type="o"/><arg direction="out" type="(oayays)"/></method>
 <method name="SetSecret"><arg direction="in" type="(oayays)"/></method>
 <property name="Locked" type="b" access="read"/><property name="Attributes" type="a{ss}" access="readwrite"/>
 <property name="Label" type="s" access="readwrite"/><property name="Created" type="t" access="read"/><property name="Modified" type="t" access="read"/>
</interface>
<interface name="org.freedesktop.Secret.Session"><method name="Close"/></interface>
</node>'''
INFO = Gio.DBusNodeInfo.new_for_xml(XML)
IF = {i.name: i for i in INFO.interfaces}

def say(line):  # the app's log (the bus's stderr) — event words only, never an item's label, attributes or value
    sys.stderr.write('[secrets] %s\n' % line); sys.stderr.flush()

def sealer(mode, data=None):
    env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'VS_APP_SECRETS_KEY': KEY}
    return subprocess.run([NODE, SEALER, mode, STORE], input=data, capture_output=True, env=env, timeout=20)

class Store:
    def __init__(self):
        self.items, self.next, self.created, self.modified = {}, 1, int(time.time()), int(time.time())
        r = sealer('open')
        if r.returncode == 3:  # undecryptable (not this display's key / a torn file): kept aside, never overwritten
            aside = '%s.unreadable-%d' % (STORE, int(time.time()))
            os.rename(STORE, aside); say('the sealed store could not be opened — kept aside as ' + os.path.basename(aside))
        elif r.returncode != 0:
            say('the sealer failed (exit %d) — refusing to start' % r.returncode); sys.exit(1)
        else:
            for it in json.loads(r.stdout.decode('utf-8') or '[]'):
                self.items[self.next] = it; self.next += 1
    def save(self):
        r = sealer('seal', json.dumps(list(self.items.values())).encode('utf-8'))
        if r.returncode != 0: say('the sealed store was not written (sealer exit %d)' % r.returncode); return False
        self.modified = int(time.time()); return True
    def match(self, attrs):
        return [n for n, it in sorted(self.items.items()) if all(it['attributes'].get(k) == v for k, v in attrs.items())]

S = Store()
SESSIONS = set()
REG = {}  # path -> [registration ids]
item_path = lambda n: '%s/%d' % (COL, n)

def item_of(path):
    if not path.startswith(COL + '/'): return None
    try: n = int(path[len(COL) + 1:])
    except ValueError: return None
    return n if n in S.items else None

def secret_of(n, session):
    it = S.items[n]
    return (session, b'', base64.b64decode(it['secret']), it.get('content_type') or 'text/plain')

def emit(conn, sig, path):
    for p in (COL, ALIAS): conn.emit_signal(None, p, 'org.freedesktop.Secret.Collection', sig, GLib.Variant('(o)', (path,)))

def register_item(conn, n):
    REG[item_path(n)] = [conn.register_object(item_path(n), IF['org.freedesktop.Secret.Item'], on_call, on_get, on_set)]

def drop_item(conn, n):
    for rid in REG.pop(item_path(n), []): conn.unregister_object(rid)
    S.items.pop(n, None)

def on_call(conn, sender, path, iface, method, params, inv):
    a = params.unpack()
    def ok(sig, *v): inv.return_value(GLib.Variant(sig, v))
    def err(name, msg): inv.return_dbus_error(name, msg)
    if iface == 'org.freedesktop.Secret.Service':
        if method == 'OpenSession':
            if a[0] != 'plain':
                say('OpenSession %s refused (NotSupported) — the client falls back to plain' % a[0][:64])
                return err(NOT_SUPPORTED, 'only the plain algorithm is supported (a private 0700 bus of the same user)')
            p = '%s/session/%d' % (BASE, len(SESSIONS) + 1); SESSIONS.add(p)
            conn.register_object(p, IF['org.freedesktop.Secret.Session'], on_call, None, None)
            say('OpenSession plain'); return ok('(vo)', GLib.Variant('s', ''), p)
        if method == 'CreateCollection': return ok('(oo)', COL, '/')
        if method == 'SearchItems': return ok('(aoao)', [item_path(n) for n in S.match(a[0])], [])
        if method == 'Unlock': return ok('(aoo)', a[0], '/')
        if method == 'Lock': return ok('(aoo)', [], '/')
        if method == 'GetSecrets':
            if a[1] not in SESSIONS: return err(NO_SESSION, 'no such session')
            return ok('(a{o(oayays)})', {p: secret_of(item_of(p), a[1]) for p in a[0] if item_of(p)})
        if method == 'ReadAlias': return ok('(o)', COL if a[0] == 'default' else '/')
        if method == 'SetAlias': return ok('()')
    if iface == 'org.vibespace.AppSecrets':
        if method == 'Count': return ok('(u)', len(S.items))
        if method == 'ForgetAll':
            ns = list(S.items)
            for n in ns: drop_item(conn, n); emit(conn, 'ItemDeleted', item_path(n))
            S.save(); say('forgot all (%d)' % len(ns)); return ok('(u)', len(ns))
    if iface == 'org.freedesktop.Secret.Collection':
        if method == 'Delete': return err(NOT_SUPPORTED, 'the default collection cannot be deleted')
        if method == 'SearchItems': return ok('(ao)', [item_path(n) for n in S.match(a[0])])
        if method == 'CreateItem':
            props, sec, replace = a
            if sec[0] not in SESSIONS: return err(NO_SESSION, 'no such session')
            attrs = dict(props.get(ATTRS) or {})
            same = [n for n in S.match(attrs) if S.items[n]['attributes'] == attrs] if replace else []
            now = int(time.time())
            val = {'label': str(props.get(LABEL) or ''), 'attributes': attrs, 'secret': base64.b64encode(bytes(sec[2])).decode('ascii'), 'content_type': sec[3] or 'text/plain', 'modified': now}
            if same:
                n = same[0]; val['created'] = S.items[n].get('created', now); S.items[n] = val; S.save(); emit(conn, 'ItemChanged', item_path(n))
            else:
                n = S.next; S.next += 1; val['created'] = now; S.items[n] = val; S.save(); register_item(conn, n); emit(conn, 'ItemCreated', item_path(n))
            return ok('(oo)', item_path(n), '/')
    if iface == 'org.freedesktop.Secret.Item':
        n = item_of(path)
        if n is None: return err(NO_OBJECT, 'no such item')
        if method == 'Delete':
            drop_item(conn, n); S.save(); emit(conn, 'ItemDeleted', path); return ok('(o)', '/')
        if method == 'GetSecret':
            if a[0] not in SESSIONS: return err(NO_SESSION, 'no such session')
            return ok('((oayays))', secret_of(n, a[0]))
        if method == 'SetSecret':
            S.items[n]['secret'] = base64.b64encode(bytes(a[0][2])).decode('ascii'); S.items[n]['content_type'] = a[0][3] or 'text/plain'
            S.items[n]['modified'] = int(time.time()); S.save(); emit(conn, 'ItemChanged', path); return ok('()')
    if iface == 'org.freedesktop.Secret.Session' and method == 'Close':
        SESSIONS.discard(path); return ok('()')
    return err(NOT_SUPPORTED, '%s.%s is not supported' % (iface, method))

def on_get(conn, sender, path, iface, prop):
    if iface == 'org.freedesktop.Secret.Service' and prop == 'Collections': return GLib.Variant('ao', [COL])
    if iface == 'org.freedesktop.Secret.Collection':
        return {'Items': lambda: GLib.Variant('ao', [item_path(n) for n in sorted(S.items)]), 'Label': lambda: GLib.Variant('s', 'Login'),
                'Locked': lambda: GLib.Variant('b', False), 'Created': lambda: GLib.Variant('t', S.created), 'Modified': lambda: GLib.Variant('t', S.modified)}[prop]()
    n = item_of(path)
    if n is None: return None
    it = S.items[n]
    return {'Locked': GLib.Variant('b', False), 'Attributes': GLib.Variant('a{ss}', it['attributes']), 'Label': GLib.Variant('s', it['label']),
            'Created': GLib.Variant('t', it.get('created', 0)), 'Modified': GLib.Variant('t', it.get('modified', 0))}[prop]

def on_set(conn, sender, path, iface, prop, value):
    n = item_of(path)
    if n is None or prop not in ('Label', 'Attributes'): return False
    S.items[n]['label' if prop == 'Label' else 'attributes'] = value.unpack(); S.save(); emit(conn, 'ItemChanged', path); return True

def on_bus(conn, name):
    for iface in ('org.freedesktop.Secret.Service', 'org.vibespace.AppSecrets'): conn.register_object(BASE, IF[iface], on_call, on_get, None)
    for p in (COL, ALIAS): conn.register_object(p, IF['org.freedesktop.Secret.Collection'], on_call, on_get, None)
    for n in sorted(S.items): register_item(conn, n)

if not KEY: say('no per-display key in the bus env — refusing to start'); sys.exit(1)
loop = GLib.MainLoop()
Gio.bus_own_name(Gio.BusType.SESSION, 'org.freedesktop.secrets', Gio.BusNameOwnerFlags.NONE, on_bus, lambda *a: say('owns org.freedesktop.secrets (%d items)' % len(S.items)), lambda *a: loop.quit())
loop.run()
