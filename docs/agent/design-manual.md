# vibespace-design — design drafts as plain HTML, shown live in the Design window

`vibespace-design` is how you draft screens, mockups, posters and flows for the
user. A design is a FOLDER in this conversation's working directory; each
screen in it is ONE ordinary HTML file you write with your own editor. The
user watches the folder in VibeSpace's **Design window** — every artboard in
its own frame on a canvas they can pan and zoom — and it repaints as you save.
They can click any element and leave a comment; it reaches you as their own
message. When they want a link, `publish` turns the folder into one page on
this VibeSpace.

There is no template language, no extra runtime and nothing to install: if a
browser can open your file, the window can show it.

This text is the CLI. The craft rules — how to make a design the user will
want — follow it under **How to design here**; read both before your first
artboard.

```
vibespace-design new <slug> [--title "…"] [--dir designs]      start a design: the folder, design.json, a Main.html to replace; opens the window
vibespace-design add <file.html> [--title "…"] [--w 1280 --h 800] [--x 0 --y 0] [--page <id>]
                                                               a new artboard: checked by VibeSpace, then given its row in design.json
vibespace-design check [dir]                                   every artboard's verdict and design.json's, by name (exit 1 on a refusal)
vibespace-design sync [dir]                                    "these files changed" — the LAST step of every edit
vibespace-design open [dir] [--title "…"]                      open (or bring forward) the Design window on the folder
vibespace-design show [dir]                                    design.json in words: artboards, pages, notes
vibespace-design publish [dir] [--public] [--page <id>]        one page on this VibeSpace (asks the user first); prints its /p/<id> path
vibespace-design list                                          this conversation's designs and their published pages
```

`[dir]` is the design folder. Left out, the current directory is used when it
holds `design.json` or an `.html` file; otherwise the command asks you to name
it (`vibespace-design list` prints yours).

---

## 1. The folder

```
designs/<slug>/
  design.json      optional: where each artboard sits, pages, notes
  Main.html        the first artboard (any name works; Main.html is shown first)
  Pricing.html     one more artboard — every .html file in the folder is one
  logo.png         an image an artboard uses, referenced by its name alone
```

**An artboard** is one complete HTML document:

- It has `<html>` and `<body>`, and no `<base>` element.
- Its name is letters, digits, space, `_`, `.` or `-`, ending in `.html`
  (at most 80 characters before it; two names that differ only in case are one
  name). At most 2 MB.
- Styles and scripts are written INLINE (`<style>…</style>`,
  `<script>…</script>`). A `<link href="site.css">` or `<script src="app.js">`
  next to it is not loaded: the frame has no folder to load it from.
- An image beside it is referenced by its bare name — `src="logo.png"` on a
  tag, `url(logo.png)` in a `style` attribute or a `<style>` block. png, jpg,
  jpeg, gif, webp and svg, at most 2 MB each; VibeSpace inlines them when it
  reads the folder and again when it publishes. A path starting with `/`, an
  image in a subfolder, or a file that is not an image is refused (`bad_ref`);
  a name with no file behind it is `missing_asset`.
- An absolute `https://…` address (a web font, a hosted image) is left as it
  is — it loads wherever the viewer's browser can reach it, so the design
  then depends on that site.

One read of a folder covers at most 40 artboards, 200 images and 24 MB; a
bigger design is refused `too_big` — split it into two designs. An artboard
whose images run past the 200 is refused by that name (the cap), never as a
missing image.

Each artboard runs in its own sandboxed frame: its scripts run, but it cannot
reach VibeSpace, the user's session or the other frames. A link from one
artboard to another does not navigate inside the window — show a flow as
artboards side by side, or as states one artboard's own script switches.

## 2. design.json

Optional. Without it every artboard is laid out in a row by name, Main.html
first, 1280 × 800 each. With it:

```json
{
  "title": "Spring menu",
  "pages": [{ "id": "flows", "name": "Flows" }, { "id": "mobile", "name": "Mobile" }],
  "artboards": [
    { "file": "Main.html", "x": 0, "y": 0, "w": 1280, "h": 800, "title": "Home", "page": "flows" },
    { "file": "Checkout.html", "w": 1280, "h": 1600, "title": "Checkout", "page": "flows", "print": "flow" },
    { "file": "Main-mobile.html", "w": 390, "h": 844, "title": "Home, phone", "page": "mobile" }
  ],
  "notes": [
    { "id": "why", "x": 0, "y": -200, "w": 360, "text": "Direction: calm, one accent colour.", "color": "blue", "page": "flows" }
  ],
  "launch": { "view": "canvas", "page": "flows" }
}
```

| Key | What it takes |
|---|---|
| `title` | the design's name as the user would say it, at most 120 characters |
| `pages` | at most 40 `{ "id", "name" }` — an id is 1–40 letters, digits, `_` or `-`; a page without a name is called by its id |
| `artboards` | at most 40 rows `{ "file", "x", "y", "w", "h", "title", "page", "print" }` — `file` is required; `x` and `y` come together (left out, the artboard is placed in the row); `w` / `h` 120–8000 (default 1280 × 800) and the frame is drawn at exactly that size, never scaled; `page` names a page id (left out: the first page); `print` is how the window's Print puts it on paper — `fixed` (default: one page of the artboard's size) or `flow` (its content flows over as many pages as it needs) |
| `notes` | at most 200 sticky notes `{ "id", "x", "y", "w", "text", "color", "page" }` — `id`, `x`, `y`, `w` and `text` are required; `w` 40–4000; text at most 5000 characters; `color` one of gray red orange green teal blue purple pink (default gray) |
| `launch` | what the window shows first: `{ "view": "canvas", "page": "<id>" }` or `{ "view": "focused", "file": "Main.html" }` |

Coordinates run from −100000 to 100000. An unknown key, at any level, is
REFUSED BY NAME (`unknown_key`, with where it sits) rather than silently
dropped — `vibespace-design check` says which. Artboards that overlap are
WARNED about and left where you put them. An artboard file with no row is
still shown, placed in the row below the placed ones. If design.json is
refused, the window still shows every artboard, laid out without it, with the
refusals above them.

Edit design.json with your own editor (re-read it first), then `check` and
`sync`.

## 3. The verbs

**`new <slug>`** — the slug is lower-case letters, digits and `-`. Creates
`designs/<slug>/` (or `<--dir>/<slug>/`) under the current directory, with a
design.json and a Main.html to replace — only the files that are missing; it
overwrites nothing. It registers the folder with VibeSpace, opens the Design
window on the user's screen, and prints the folder's absolute path on its
first line: work in that folder from then on.

```
$ vibespace-design new spring-menu --title "Spring menu"
/home/me/project/designs/spring-menu
created design.json + Main.html — replace Main.html with the first screen, then: vibespace-design add <file.html> · check · sync
the Design window is open on the user's screen
```

**`add <file.html>`** — after you write a NEW artboard. VibeSpace checks the
file first (refused ⇒ nothing is added and the reason is printed); then its
row is added to design.json — or updated, if the file already has one — with
any of `--title`, `--w`/`--h`, `--x`/`--y` (together) and `--page` you give;
then the whole design.json is checked again (refused ⇒ it is put back exactly
as it was) and the window repaints. The file must sit in the design folder
itself, not be a link to one elsewhere.

```
$ vibespace-design add designs/spring-menu/Main-mobile.html --w 390 --h 844 --title "Home, phone" --page mobile
```

**`check [dir]`** — prints `✓ Main.html 1280×800 at 0,0`, `✗ Pricing.html — <why>`,
`✗ design.json <where>: <why>`, `! <overlap>` and the published size; exits 1
when anything is refused. Run it before you hand over.

**`sync [dir]`** — tells VibeSpace the folder's files changed (design.json,
the artboards and the images), and every Design window open on it repaints the
frames that changed — the user's zoom and position are kept. On this machine
the window also notices a saved file by itself within a few seconds; on a
remote host ONLY `sync` repaints it. Make `sync` the last step of every edit,
wherever you run. (One browser tab watches at most 16 designs, one VibeSpace
32 in all; a window past that says "Live repaint off" and still repaints on
your `sync` or its Reload.)

**`open [dir]`** — opens (or brings forward) the Design window on the folder,
registering it first if needed. Use it when the user asks to see a design
again.

**`show [dir]`** — design.json in words: each artboard's title, size and place,
the pages, the launch view, every note in full, and any refusal or warning.

**`publish [dir] [--public] [--page <id>]`** — bundles every artboard and its
images into ONE self-contained page on this VibeSpace and prints its path.

- **It asks the user first** (a permission card in their chat) — except in the
  full-access mode, where it runs at once, and in the refuse-what-is-not-
  approved mode, where it is refused. If they decline, say what you would have
  published and stop; never retry it in a loop.
- Private by default: viewers log in to this VibeSpace. `--public` makes it a
  link anyone can open; leaving the flag out keeps whatever the user set since.
- The same folder published again = the SAME URL with the new version.
  `--page <id>` publishes onto another page this conversation published
  (`page_forbidden` otherwise).
- It refuses (`not_publishable`) a folder whose design.json or any artboard is
  refused, or that holds no artboard; over 8 MB it warns that the page loads
  slowly, at 25 MB it is refused.
- It prints a RELATIVE path, `/p/<id>`. Write that path verbatim in your
  reply — the chat turns it into a working link against the address the user
  opens VibeSpace at. Never prefix it with a host name or an IP.

**`list`** — this conversation's designs (an earlier part of the same
conversation counts): folder, title, and the published page's path and
visibility when there is one.

## 4. Comments from the user

In the Design window the user can pick an element and write a comment. It
arrives as THEIR message, in one line:

```
[Design comment] Main.html › header > nav > a.cta ("Get started"): make this bigger and green
```

— the artboard, the element's path, its text (cut at 120 characters), then
what they asked. If your conversation was not running when they wrote it, it
waits and is handed to you with your next turn. Treat it as a request about
that one element: re-read the file, change it, `sync`, and answer in a line.

## 5. When something is refused

Every refusal names its code and the place: `unknown_key`, `bad_type`,
`out_of_range`, `too_many`, `too_long`, `bad_name`, `duplicate`,
`unknown_page`, `bad_value` (design.json); `not_document`, `has_base`,
`bad_ref`, `missing_asset`, `asset_too_big`, `too_big`, `empty` (an artboard);
`not_registered` (run `vibespace-design open <dir>`, or start with
`vibespace-design new`). Fix
the named thing and run the verb again; the message says what was expected.

## 6. Rules

- Your token rides your session's environment — never put it on the command
  line.
- Everything the user needs — the folder, what you drafted, what you assumed,
  a published path — goes in your CHAT REPLY; the tool's output is not a
  substitute.
- Publish only what the user asked for: a published page goes out under their
  name.
- Any other self-contained HTML (a report, a one-page tool) is shared with
  `vibespace-page publish` (`vibespace-docs pages`).
