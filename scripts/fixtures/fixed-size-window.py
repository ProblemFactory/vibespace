#!/usr/bin/env python3
# A FIXED-SIZE X11 window for scripts/test-desktop-app-fixed.mjs (lane app-fit-fixed): GTK 3 set_resizable(False) writes
# WM_NORMAL_HINTS minimum = maximum = the requested size (what WeChat's login and Inkscape's welcome state). The picture is
# a pale grid inside a 6 px RED border, so a screenshot shows whether every edge is on screen.
# argv: W H [normal|dialog]  — `dialog` = a DIALOG-typed, modal window with no parent (Inkscape 1.4's welcome).
# SIGUSR1 replaces it with a RESIZABLE 600×400 main window (WeChat's login → its main window).
import signal, sys, gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib
W, H = int(sys.argv[1]), int(sys.argv[2])
mode = sys.argv[3] if len(sys.argv) > 3 else 'normal'
def picture(w, h):
    da = Gtk.DrawingArea(); da.set_size_request(w, h)
    def draw(wd, cr):
        a = wd.get_allocation(); cr.set_source_rgb(0.92, 0.95, 1.0); cr.paint()
        cr.set_source_rgb(0.2, 0.4, 0.8)
        for x in range(0, a.width, 50): cr.rectangle(x, 0, 1, a.height)
        for y in range(0, a.height, 50): cr.rectangle(0, y, a.width, 1)
        cr.fill()
        cr.set_source_rgb(0.9, 0.1, 0.1)
        cr.rectangle(0, 0, a.width, 6); cr.rectangle(0, a.height - 6, a.width, 6); cr.rectangle(0, 0, 6, a.height); cr.rectangle(a.width - 6, 0, 6, a.height)
        cr.fill()
        return False
    da.connect('draw', draw)
    return da
win = Gtk.Window(title='fixed %dx%d %s' % (W, H, mode))
if mode == 'dialog':  # Inkscape 1.4.3's welcome: typed DIALOG, modal, no parent
    win.set_type_hint(Gdk.WindowTypeHint.DIALOG); win.set_modal(True)
win.add(picture(W, H))
win.set_resizable(False)
win.connect('destroy', lambda *_: None if getattr(win, '_replaced', False) else Gtk.main_quit())
win.show_all()
def replace():
    main = Gtk.Window(title='resizable main'); main.set_default_size(600, 400); main.add(picture(200, 150))
    main.connect('destroy', Gtk.main_quit); main.show_all()
    win._replaced = True; win.destroy()
    return False
GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGUSR1, replace)
Gtk.main()
