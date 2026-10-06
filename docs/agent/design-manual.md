# vibespace-design — design drafts as plain HTML, shown live in the Design window

`vibespace-design` is how you draft screens, mockups, posters and flows for the
user. A design is a FOLDER in this conversation's working directory; each
screen in it is ONE ordinary HTML file you write with your own editor. The
user watches the folder in VibeSpace's **Design window** — every artboard in
its own frame on a canvas they can pan and zoom — and it repaints as you save.
They can click any element and leave a comment; it reaches you as their own
message — or collect several changes and send them to you as ONE message. Knobs you declare (**Tweaks**) they move
themselves and see the result at once, with no message to you. When they want a link, `publish` turns the folder into one page on
this VibeSpace. Presenting, a PDF and a file to send are the user's own
buttons in the window (§7).

There is no template language, no extra runtime and nothing to install: if a
browser can open your file, the window can show it.

This text is the CLI. The craft rules — how to make a design the user will
want — follow it under **How to design here**; read both before your first
artboard.

```
vibespace-design new <slug> [--title "…"] [--dir designs] [--system <name>|none]
                                                               start a design: the folder, design.json, a Main.html to replace; opens the window
vibespace-design new <slug> --kind system [--title "…"]        start a DESIGN SYSTEM: system.md + tokens.css + a components artboard
vibespace-design systems                                       the design systems on this VibeSpace, and the default one
vibespace-design add <file.html> [--title "…"] [--w 1280 --h 800] [--x 0 --y 0] [--page <id>]
                                                               a new artboard: checked by VibeSpace, then given its row in design.json
vibespace-design check [dir]                                   every artboard's verdict and design.json's, by name (exit 1 on a refusal)
vibespace-design sync [dir]                                    "these files changed" — the LAST step of every edit
vibespace-design open [dir] [--title "…"]                      open (or bring forward) the Design window on the folder
vibespace-design open [dir] --for <conversation>               HAND the design over: its chat + Artifacts, the Design window opens for its user
vibespace-design show [dir]                                    design.json in words: artboards, pages, notes, tweaks + what the user set
vibespace-design ask [dir] < questions.json                    BEFORE drawing a new design: your questions as a form in the window; then stop
vibespace-design preview <file.html>                           an address your browser opens: look at the artboard before you hand over
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
  "launch": { "view": "canvas", "page": "flows" },
  "tweaks": [
    { "id": "accent", "label": "Accent colour", "kind": "color", "var": "--accent", "default": "#e11d48" },
    { "id": "radius", "label": "Corner radius", "kind": "range", "var": "--radius", "min": 0, "max": 24, "step": 2, "unit": "px", "default": 8 },
    { "id": "density", "label": "Density", "kind": "select", "attr": "data-density", "options": ["compact", "comfortable"], "default": "comfortable" }
  ]
}
```

| Key | What it takes |
|---|---|
| `title` | the design's name as the user would say it, at most 120 characters |
| `pages` | at most 40 `{ "id", "name" }` — an id is 1–40 letters, digits, `_` or `-`; a page without a name is called by its id |
| `artboards` | at most 40 rows `{ "file", "x", "y", "w", "h", "title", "page", "print" }` — `file` is required; `x` and `y` come together (left out, the artboard is placed in the row); `w` / `h` 120–8000 (default 1280 × 800) and the frame is drawn at exactly that size, never scaled; `page` names a page id (left out: the first page); `print` is how the window's Print puts it on paper — `fixed` (default: one page of the artboard's size) or `flow` (its content flows over as many pages as it needs) |
| `notes` | at most 200 sticky notes `{ "id", "x", "y", "w", "text", "color", "page" }` — `id`, `x`, `y`, `w` and `text` are required; `w` 40–4000; text at most 5000 characters; `color` one of gray red orange green teal blue purple pink (default gray) |
| `launch` | what the window shows first: `{ "view": "canvas", "page": "<id>" }` or `{ "view": "focused", "file": "Main.html" }` |
| `tweaks` | at most 12 knobs `{ "id", "label", "kind", "var" \| "attr", "default", … }` the user moves in the window's Tweaks panel — see **Tweaks** in §4 |
| `system` | the design system this design follows — `"system": { "name": "Acme" }`, written by `new --system`; its tokens.css sits beside the artboards (see **Design systems** below) |

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

`--system <name>` makes the design follow a design system (below): its
tokens.css is copied into the new folder, design.json records
`"system": { "name": … }`, and Main.html starts with the tokens pasted into
its `<style>`. Without `--system`, `new` follows this VibeSpace's DEFAULT
design system when the user set one (it says so); `--system none` starts
without. A name that is not a design system is refused and nothing is made.
`--kind system` starts a design system itself.

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

**`ask [dir] < questions.json`** — the user asked for a NEW design (or the
request says "Ask me a few questions first") → before the first artboard, ask
what decides the drawing (the craft rule "Ask first" says which), then STOP
until they answer. The questions come on stdin as JSON — a list, or
`{"questions": [...]}`:

```
[
  { "id": "platform", "q": "Where will people use it?", "kind": "one", "options": ["iPhone", "Desktop web", "Both"] },
  { "id": "directions", "q": "How many directions do you want to see first?", "options": ["1", "2", "3"], "other": false },
  { "id": "tweak", "q": "What would you like to try out?", "help": "You can change these later without me.", "kind": "many", "options": ["Accent colour", "Dark / light", "Density"] }
]
```

At most 8 questions; each has an `id` (1–40 letters, digits, `_` or `-`,
used once), its words `q` (at most 200 characters), an optional `help` line
(400), `kind` `one` (default) or `many`, and at most 8 `options` (80
characters each). Every question ends in "Decide for me" and "Other…" (the
user writes an answer, at most 500 characters); `"other": false` drops
"Other…" — then the question needs options. An unknown key or a bound
crossed is refused by name (`bad_questions`, each refusal listed), nothing is
shown. The Design window comes forward with the questions as a form over the
canvas; asking again replaces the questions still open. You may ask only on a
design of your own conversation (`not_yours` otherwise).

`ask` prints the questions back. List them in your reply too — a user who
stays in the chat answers there — and draw nothing until the answers come
(§4).

**`preview <file.html>`** — you are about to hand a design over, or the user
says something looks wrong → look at it yourself. It prints an address on its
first line (it works for 15 minutes; every load re-reads the file, so fix,
`sync`, reload) and the artboard's own size, then the three browser commands
to run:

```
$ vibespace-design preview designs/spring-menu/Main.html
http://127.0.0.1:3000/api/agent/design/preview?t=…
Main.html at its own size 1280×800; this address works for 15 minutes and re-reads the file on every load. Look at it:
  vibespace-browser open "http://127.0.0.1:3000/api/agent/design/preview?t=…"
  vibespace-browser set viewport 1280 800
  vibespace-browser screenshot /tmp/Main-check.png
```

The page is the artboard with its images inlined, sandboxed exactly like a
published page. A refused artboard has no preview (`not_previewable` —
`check` says why); a folder that is not registered serves nothing.

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
visibility when there is one; a design system is marked `[design system]`.

**`systems`** — every design system on this VibeSpace (any conversation's:
a brand is meant to carry), by name and folder, and which one is the default.

### Design systems

The user asked for a design system — "make our brand kit", "a design system
from this repo", "use the Acme look for everything" — or picked one in the
chat's design chip ("Follow the design system "Acme"" in their request).

**Making one.** `vibespace-design new acme --kind system --title "Acme"`
creates a design folder that IS a design system:

```
designs/acme/
  system.md      the guide: what it is for, type, colour, components, do / don't
  tokens.css     every colour, font size, radius and spacing as a custom property (:root { --color-accent: … })
  Main.html      the first component artboard — one artboard per group (buttons, forms, cards …)
```

Build it from what the user points at — the codebase's stylesheets and
components, files, a site — never from a generic kit. Its artboards are
ordinary artboards (the user reviews them and comments as on any design),
each built ONLY from tokens.css. A folder holding system.md and tokens.css is
a design system; `open` lists it again as one.

**Following one.** `vibespace-design new promo --system acme` copies the
system's tokens.css into the new folder (the design stays self-contained: it
travels without the system's folder). Paste tokens.css into each artboard's
`<style>` (Main.html starts that way) and write every colour and font size as
`var(--…)`. A later change to the system is NOT pulled in by itself — copy
the new tokens.css over when the user asks for it.

**The check.** Every read of a folder that holds tokens.css — `check`, `show`,
the window — compares each artboard with it and WARNS, never refuses:
`not_token` (a hex / rgb() / hsl() colour or a font size that is none of the
tokens' values), `token_drift` (the artboard sets a custom property tokens.css
also sets, to another value), `no_tokens` (design.json names a system but
tokens.css is gone), `bad_tokens` (tokens.css over 256 KB or not usable). A
value inside `var(…)` is the token's own and never warned. At most 6
warnings per artboard are printed.

The user's own acts touch only VibeSpace's list, never your files: in the
Design window's home (⚙ Tools ▸ Designs…) they can rename a design or remove
it from the list — the folder stays.

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

The answers to your `ask` arrive the same way, as their message:

```
[Design answers] platform: iPhone · directions: 2 · tweak: Accent colour, "font pairing"
[Design answers] skipped — decide everything yourself
```

— each question's `id`, then the options they picked, an "Other…" answer in
quotes, or `decide for me`. Draw from them, and say in your reply what you
chose wherever they left it to you.

### Several changes in one message

The user can also collect changes and send them together: they retype a text
in place, nudge an element's text colour, background, font size or spacing, or
add comments. Each is only a PREVIEW in their window — nothing is written to
your files. "Send all" gives you ONE message, one numbered line per change:

```
[Design changes] 3 changes:
1. Main.html › header > h1: text "Hello" → "Welcome back"
2. Main.html › header > nav > a.cta ("Get started"): background-color rgb(51, 102, 255) → #22c55e
3. About.html › footer: smaller and grey
```

Make EVERY line in the source, then `sync` once and answer in a line or two:

- `text "A" → "B"` — replace those words. When they come from a shared
  component, a loop or a variable, change them there, once.
- `<property> <before> → <after>` — the before is the browser's computed
  value. Change the rule that sets it: the design token (custom property) when
  the value comes from one, the element's own class otherwise — not an inline
  `style=` unless the page already styles that element inline.
- `: <words>` — a comment, as above.

A line you cannot make (the element is gone, the words changed since) — say
which, and make the rest.

### Tweaks — knobs the user moves without a turn

The user wants to TRY values — another accent, rounder corners, a denser list,
dark — without asking you each time. Give them knobs: declare 3–8 `tweaks` in
design.json and write the artboards' CSS against them. The window's **Tweaks**
panel draws one control per knob; moving one restyles every artboard at once,
sends you NOTHING and costs no turn. VibeSpace keeps the user's values in
`user.json` beside design.json and bakes them into what the window shows,
`preview` serves and `publish` puts on the page.

A knob drives ONE thing your CSS reads:

- `"var": "--accent"` — a custom property. Define its default on `:root` and use
  `var(--accent)` wherever it matters. The user's value is set on `:root` with
  `!important`, so it wins over yours.
- `"attr": "data-density"` — an attribute on the `<html>` element. Write rules
  like `[data-density="compact"] .row { padding: 4px 8px }`. The user's value
  wins over one you wrote on `<html>`.

| `kind` | takes | what your CSS gets |
|---|---|---|
| `color` | `default` as `#rrggbb` | `#rrggbb` |
| `range` | `min`, `max`, `default`; optional `step` and `unit` (px rem em % vw vh ch fr deg ms s) | the number + its unit on a property (`12px`), the bare number on an attribute |
| `select` | 2–12 `options` (each one line of at most 80 characters — no `< > { } ;`, backslash, `!` or comment, quotes closed) and a `default` among them | the option as written (`"Inter", sans-serif` works on a property) |
| `toggle` | `default` true or false | `1` / `0` on a property (`calc(var(--shadow) * 8px)`), `"true"` / `"false"` on an attribute (`[data-dark="true"]`) |

Every knob has an `id` (1–40 letters, digits, `_` or `-`), a `label` (what the
user reads, at most 60 characters), its `kind`, exactly ONE of `var` / `attr`
(each driven by one knob; `data-vibespace-…` is VibeSpace's own) and a
`default`. At most 12 per design. A bad knob is refused by name like the rest
of design.json.

**Read the user's choices; never write them.** `vibespace-design show` lists
every knob and what the user set (`→ the user set #0f766e`); `check` says it in
one line. When they like a setting and ask you to keep it, make it the
design: change the knob's `default` and your CSS default to it. `user.json` is
THEIRS — VibeSpace writes it on their acts only; a value you put there is
judged like any input and is not how a design changes.

On a design without knobs the panel offers **+ Tweaks**; pressing it sends you
the user's own message:

```
[Design tweaks] Add Tweaks to this design: declare 3–8 knobs in design.json for what I would want to try — the hero's background and the type
```

Declare the knobs, write the CSS against them, then `check` and `sync`.

## 5. When something is refused

Every refusal names its code and the place: `unknown_key`, `bad_type`,
`out_of_range`, `too_many`, `too_long`, `bad_name`, `duplicate`,
`unknown_page`, `bad_value` (design.json); `not_document`, `has_base`,
`bad_ref`, `missing_asset`, `asset_too_big`, `too_big`, `empty` (an artboard);
`not_registered` (run `vibespace-design open <dir>`, or start with
`vibespace-design new`); `bad_questions` and `not_yours` (from ask),
`bad_file` and `not_previewable` (from preview); `no_system`, `ambiguous`
(two systems of that name — name one by its folder), `no_tokens` and
`bad_tokens` (from `new --system`: nothing is made). Fix
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

## 7. Presenting, a PDF, a file to send

The user asks to **present** the design, for **slides / a deck**, for a
**PDF**, or for **a file** to send someone. Each is the user's own button in
the Design window — tell them where it is; never build an exporter:

- **Present** — ▶ Present on the window's bar: the current page's artboards
  one at a time, full-screen, each fitted to the screen, in READING order —
  rows top to bottom, each row left to right, as design.json places them.
  → ← Space, a click or a swipe step; Esc ends. A published page presents
  too: its own ▶, or its link with `#present` at the end (`/p/<id>#present`)
  opens presenting.
- **A PDF** — Print with no artboard open (or ⋯ "Print all artboards on this
  page"): one PDF page per artboard, each at the artboard's own size; the user
  chooses "Save as PDF" in the print dialog. With one artboard open, Print
  prints that one.
- **A file** — ⋯ "Download HTML": the same single page `publish` would host
  (it opens offline and presents), nothing published. ⋯ "Download folder
  (.zip)": the folder itself.
- There is no PowerPoint (.pptx) export and no PNG per artboard: offer the
  PDF, or presenting from the published link.

A deck is artboards like any design — one per slide, every slide the same
size, in reading order; the craft rules say how (§8 of How to design here).
