#!/usr/bin/env python3
# TWO NORMAL TOP-LEVELS IN ONE PROCESS for scripts/test-desktop-xpra-window.mjs §18 (design 016 S1 + S2, lanes app-guest-window
# and app-satellite-windows): WeChat's shape — a resizable main window, then (once the TRIGGER file exists) a SECOND NORMAL
# window with no transient-for whose WM_NORMAL_HINTS minimum is read from the trigger ("W H", device px: the suite sizes it
# from the workspace it measured). Closing the second (WM_DELETE_WINDOW — xpra's close-window) destroys only it and writes
# the CLOSED file. Each window logs the keys it receives (CLOSED.main-keys / CLOSED.second-keys) and the second pops a menu
# (an override-redirect popup) on a right click. Triggers, each consumed: TRIGGER.raise — the app present()s its second
# again (WeChat re-raising Moments: _NET_ACTIVE_WINDOW from the application, source 1); TRIGGER.again — a new second after
# the last one closed; TRIGGER.third — a third NORMAL window; TRIGGER.dropmain — the app destroys its MAIN window and keeps
# running while another window is left (the main's loss: S2's adopt). The process quits when its last window goes.
# Not xterm (the design's sketch): xterm writes its own minimum (one cell, 10×17) whatever `-xrm '*minWidth: …'` says
# (MEASURED on this box, xprop WM_NORMAL_HINTS); GTK 3 via gi is what scripts/fixtures/fixed-size-window.py already uses.
# argv: TRIGGER CLOSED [MAIN_TITLE] [SECOND_TITLE]
import os, sys, gi
os.environ['GDK_BACKEND'] = 'x11'  # X only: an unset WAYLAND_DISPLAY still reaches $XDG_RUNTIME_DIR/wayland-0 — the person's own session (MEASURED)
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib
trigger, closed = sys.argv[1], sys.argv[2]
t1 = sys.argv[3] if len(sys.argv) > 3 else 'vs-two-main'
t2 = sys.argv[4] if len(sys.argv) > 4 else 'vs-two-second'
state = {'opened': False, 'second': None, 'main': None, 'third': None, 'min': None}
def painted(rgb):
    da = Gtk.DrawingArea()
    def draw(wd, cr):
        cr.set_source_rgb(*rgb); cr.paint(); return False
    da.connect('draw', draw)
    return da
def keys_to(path):
    def on_key(win, ev):
        with open(path, 'a') as f: f.write(ev.string or '')
        return False
    return on_key
def left():
    return [w for w in (state['main'], state['second'], state['third']) if w is not None]
def gone(key):
    def on_destroy(win):
        state[key] = None
        if not left(): Gtk.main_quit()
    return on_destroy
def menu_at(da, ev):
    if ev.button != 3: return False
    menu = Gtk.Menu()
    for label in ('vs-menu-one', 'vs-menu-two'): menu.append(Gtk.MenuItem(label=label))
    menu.show_all()
    menu.popup_at_pointer(ev)
    state['menu'] = menu  # kept alive while shown
    return True
main = Gtk.Window(title=t1)
main.add(painted((0.82, 0.93, 0.82)))
main.set_default_size(500, 360)
main.connect('key-press-event', keys_to(closed + '.main-keys'))
main.connect('destroy', gone('main'))
main.show_all()
state['main'] = main
def second_closed(win, ev):
    win.destroy()
    with open(closed, 'w') as f: f.write('closed\n')
    return True
def open_second():
    mw, mh = state['min']
    second = Gtk.Window(title=t2)  # NORMAL, no transient-for: a second top-level, as WeChat's Moments
    da = painted((0.95, 0.84, 0.84))
    da.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
    da.connect('button-press-event', menu_at)
    second.add(da)
    g = Gdk.Geometry(); g.min_width = mw; g.min_height = mh
    second.set_geometry_hints(None, g, Gdk.WindowHints.MIN_SIZE)
    second.set_default_size(mw, mh)
    second.connect('delete-event', second_closed)
    second.connect('key-press-event', keys_to(closed + '.second-keys'))
    second.connect('destroy', gone('second'))
    second.show_all()
    state['second'] = second
def consumed(name):
    p = trigger + name
    if not os.path.exists(p): return False
    os.unlink(p)
    return True
def poll():
    if not state['opened'] and os.path.exists(trigger):
        try: state['min'] = tuple(int(v) for v in open(trigger).read().split()[:2])
        except ValueError: return True  # written but not yet complete: the next poll
        state['opened'] = True
        open_second()
    if state['second'] is not None and consumed('.raise'): state['second'].present()
    if state['opened'] and state['second'] is None and consumed('.again'): open_second()
    if state['third'] is None and consumed('.third'):
        third = Gtk.Window(title='vs-two-third')
        third.add(painted((0.84, 0.86, 0.95)))
        third.set_default_size(300, 200)
        third.connect('destroy', gone('third'))
        third.show_all()
        state['third'] = third
    if state['main'] is not None and consumed('.dropmain'): state['main'].destroy()
    return True
GLib.timeout_add(150, poll)
Gtk.main()
