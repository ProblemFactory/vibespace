#!/usr/bin/env python3
# THE NOTIFICATIONS SINK of an app's private session bus (lane app-display-notify-sink, B-4a59 piece 2).
# The bus ACTIVATES this file (the PURE companion plan, src/desktop-apps.js portalPlan, writes its .service): it owns
# org.freedesktop.Notifications (Desktop Notifications spec 1.2) on the bus it was started by and appends ONE JSON line
# per Notify / CloseNotification to $VS_NOTIFY_JOURNAL (a file in the app's own 0700 dir) — the machine keeper
# (src/desktop-serve.js) reads it and the hub shows it inside the app's window. Nothing rides argv; no network.
# MEASURED (2026-10-12, before this file): with nobody owning the name, libnotify / GApplication got ServiceUnknown (the
# notification silently dropped), the portal's Notification answered () and its gtk backend dropped it too.
# Python 3 + GObject introspection (Gio = GDBus): the D-Bus server this box offers; node has no D-Bus. A machine without
# it gets no sink — the plan says `notify: unavailable: <why>` and the app runs as before.
import json, os, sys, time
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib

NAME, PATH = 'org.freedesktop.Notifications', '/org/freedesktop/Notifications'
XML = '''<node><interface name="org.freedesktop.Notifications">
<method name="GetCapabilities"><arg type="as" direction="out"/></method>
<method name="Notify"><arg type="s" name="app_name"/><arg type="u" name="replaces_id"/><arg type="s" name="app_icon"/>
<arg type="s" name="summary"/><arg type="s" name="body"/><arg type="as" name="actions"/><arg type="a{sv}" name="hints"/>
<arg type="i" name="expire_timeout"/><arg type="u" direction="out"/></method>
<method name="CloseNotification"><arg type="u" name="id"/></method>
<method name="GetServerInformation"><arg type="s" direction="out"/><arg type="s" direction="out"/><arg type="s" direction="out"/>
<arg type="s" direction="out"/></method>
<signal name="NotificationClosed"><arg type="u"/><arg type="u"/></signal>
<signal name="ActionInvoked"><arg type="u"/><arg type="s"/></signal>
</interface></node>'''
URGENCY = {0: 'low', 1: 'normal', 2: 'critical'}
CLOSED_BY_CALL = 3  # the spec's reason "closed by a call to CloseNotification"
JOURNAL = os.environ.get('VS_NOTIFY_JOURNAL') or ''
VERSION = os.environ.get('VS_NOTIFY_VERSION') or '0'
state = {'next': 0, 'open': set()}
loop = GLib.MainLoop()


def journal(rec):
    if not JOURNAL:
        return
    line = (json.dumps(rec, ensure_ascii=False) + '\n').encode('utf-8')
    fd = os.open(JOURNAL, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, line)  # ONE write per record: the reader never sees half a line it cannot finish
    finally:
        os.close(fd)


def on_call(conn, sender, path, iface, method, params, inv):
    try:
        if method == 'GetCapabilities':
            return inv.return_value(GLib.Variant('(as)', (['body'],)))  # P0: no actions, no icons
        if method == 'GetServerInformation':
            return inv.return_value(GLib.Variant('(ssss)', ('VibeSpace', 'VibeSpace', VERSION, '1.2')))
        if method == 'Notify':
            app, replaces, _icon, summary, body, _actions, hints, _expire = params.unpack()
            if replaces and replaces in state['open']:
                nid = replaces
            else:
                state['next'] += 1
                nid = state['next']
            state['open'].add(nid)
            u = hints.get('urgency', 1)
            journal({'nid': nid, 'app': app, 'summary': summary, 'body': body,
                     'urgency': URGENCY.get(u if isinstance(u, int) else 1, 'normal'), 'at': int(time.time() * 1000)})
            return inv.return_value(GLib.Variant('(u)', (nid,)))
        if method == 'CloseNotification':
            (nid,) = params.unpack()
            if nid in state['open']:
                state['open'].discard(nid)
                journal({'nid': nid, 'closed': True, 'at': int(time.time() * 1000)})
                conn.emit_signal(None, PATH, NAME, 'NotificationClosed', GLib.Variant('(uu)', (nid, CLOSED_BY_CALL)))
            return inv.return_value(None)
        inv.return_dbus_error('org.freedesktop.DBus.Error.UnknownMethod', method)
    except Exception as e:  # a bad call never kills the sink
        inv.return_dbus_error('org.freedesktop.DBus.Error.Failed', str(e)[:200])


def on_bus(conn, _name):
    conn.register_object(PATH, Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0], on_call, None, None)


Gio.bus_own_name(Gio.BusType.SESSION, NAME, Gio.BusNameOwnerFlags.NONE, on_bus, None, lambda *_: loop.quit())
try:
    loop.run()
except KeyboardInterrupt:
    pass
sys.exit(0)
