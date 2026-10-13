#!/usr/bin/env python3
# A FAKE APP that notifies (scripts/test-desktop-app-notify, lane app-display-notify-sink): shows one X window (xmessage
# on its own display) and, for every <trigger dir>/<n>.json {summary, body, urgency 0|1|2} that appears, calls
# org.freedesktop.Notifications.Notify on ITS session bus (the app's private bus — what libnotify does in-process).
# argv: <trigger dir>. Exits when its window does.
import json, os, subprocess, sys, time
from gi.repository import Gio, GLib

trig = sys.argv[1]
win = subprocess.Popen(['xmessage', '-geometry', '420x200+10+10', '-bg', 'white', '-fg', 'black', 'JASP (a fake app that notifies)'])
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
while win.poll() is None:
    for f in sorted(os.listdir(trig)):
        if not f.endswith('.json'):
            continue
        p = os.path.join(trig, f)
        n = json.load(open(p))
        os.unlink(p)
        r = bus.call_sync('org.freedesktop.Notifications', '/org/freedesktop/Notifications', 'org.freedesktop.Notifications', 'Notify',
                          GLib.Variant('(susssasa{sv}i)', ('JASP', 0, '', n['summary'], n.get('body', ''), [], {'urgency': GLib.Variant('y', n.get('urgency', 1))}, -1)),
                          None, 0, 5000, None)
        open(p + '.sent', 'w').write(str(r.unpack()[0]))
    time.sleep(0.1)
