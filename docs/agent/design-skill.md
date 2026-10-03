# How to design here — the craft rules for vibespace-design

The CLI above puts your HTML in front of the user. These rules are about what
you put there. They are short on purpose; each one exists because skipping it
produces a draft the user throws away.

## 1. Look before you draw

First the design systems: when the user's request names one ("Follow the
design system "Acme"") — or `vibespace-design systems` shows a default —
`new --system` copies its tokens.css; draw with those tokens only and say so.
Ask before following a system the user did not name or choose.

Then, before the first artboard, search the project the user is working in
for what already decides the look:

- design tokens — CSS custom properties (`--color-…`, `--radius`), a Tailwind
  or theme config, a `tokens.json`, SCSS variables;
- components the product already has — buttons, cards, navigation, form
  fields — and how they are spelled in the source;
- fonts (font-face rules, a font stack in the base stylesheet), the logo,
  the icon set, the real product name and its real copy.

Use what you find, by value, inside each artboard's `<style>`. In your
hand-over, SAY what you matched ("colours and radius from
`src/styles/tokens.css`, buttons after `Button.tsx`") and what you made up
because nothing settled it. A design that ignores the product it belongs to
is the most common reason a draft is rejected.

## 2. Ask first — then draw

The user asked for a NEW design → unless the brief already settles them, ask
3–6 questions BEFORE the first artboard with `vibespace-design ask`, and then
STOP: draw nothing until their `[Design answers]` message (or an answer in the
chat) arrives. Ask what decides the drawing:

- what it is for, and for whom;
- the platform and size (a phone, a desktop page, a poster, a slide);
- static or clickable (below);
- how many directions they want to see first;
- what they will want to try out later (an accent, density, dark or light);
- imagery: their own photos, illustration, none.

Give each question real options in the product's words — the form adds
"Decide for me" and "Other…" itself. List the same questions in your reply.
A request from the chat's design chip says "Ask me a few questions first"
when the user wants the form; without that line, or for a change to a design
that exists, do not ask — decide, and NAME what you decided.

**Static or prototype.** A **static** design is screens to look at. A
**prototype** is screens that respond: tabs that switch, a menu that opens, a
form that validates — driven by a small inline script inside ONE artboard
(frames do not navigate to each other, so a flow is either states inside one
artboard or artboards placed side by side in reading order). If the user can
answer, ask once which they want — it belongs among the questions. If they
left it to you, choose yourself and NAME the choice in your reply ("static
screens; say if you want the checkout clickable").

## 3. Directions only when nothing settles the look

When the project has a brand or a design system, draw ONE direction, at full
fidelity, in that system. Only when nothing settles the look (a new product,
a poster, "make it nice") draw two to four low-fidelity directions first —
side by side, one page, each with a short note saying its idea — and let the
user pick before you refine one. Directions differ in their IDEA (dense vs
spacious, playful vs sober, image-led vs type-led), not in a shade of the
same idea.

Give every direction a stable id and a word, in its artboard titles and its
note: "A · calm", "B · dense". A later round of B is "B2" — never a letter
used before, so "make it more like B" always means one thing.

## 4. Each artboard is a whole page

- One complete HTML document per artboard: `<!doctype html>`, `<html>`,
  `<head>` with `<meta charset>` and a `<title>`, `<body>`. Styles and
  scripts inline. No build step, no framework that needs compiling.
- Images sit beside the artboard and are named alone (`src="hero.jpg"`).
  Generated art is better as inline SVG or CSS than as a placeholder box.
- Real words. Use the brief's words and the product's own copy; invent
  plausible, specific content (names, prices, dates, counts) where none is
  given. Never lorem ipsum, never "Title here" — placeholder text hides
  whether the layout works.
- Sizes: a phone screen is **390** wide (844 tall), a desktop page **1280**
  wide (800 for one screen, taller for a whole page). Give each artboard its
  size with `--w` / `--h` on `add` or in design.json, and design for that
  width — not a centred column floating in a wide frame.
- Ordinary craft: semantic elements (`header`, `nav`, `main`, `button`), text
  as text (never baked into an image), visible focus and hover states, enough
  contrast to read, spacing from one scale.
- Keep the folder tidy: one artboard per screen or state the user should
  see, named by what it shows (`Checkout.html`, `Checkout-error.html`).
  Use pages to group flows or directions, notes for the reasoning that
  belongs beside them.
- Give the user knobs. Declare 3–8 `tweaks` for what they will want to try —
  the accent, corner radius, density, the type pairing, dark or light — and
  write the CSS against them (a `:root` custom property, or a `data-` attribute
  on `<html>`), so one choice moves every artboard. They try values in the
  Tweaks panel without a turn; `show` tells you what they settled on. Never
  write `user.json` — it is theirs.

## 5. Every edit starts from the disk

The user may have commented, another agent of the same Task Group may have
changed a file, and your memory of a file is older than the file. So:

- Before EVERY edit, re-read the folder (`vibespace-design show`) and the file
  you are about to change. Edit what is on disk; never rewrite an artboard
  from memory.
- A `[Design comment]` names one element in one file: change that element,
  leave the rest.
- A `[Design changes]` message is a numbered list from the user's window
  (retyped texts, colour / size / spacing nudges, comments): make every line
  in the source — a repeated component or a token once, where it is defined —
  then ONE `sync`.
- End EVERY edit with `vibespace-design add <file>` (a new artboard) or
  `vibespace-design sync` (a changed one, design.json, an image) — it is what
  repaints the user's window, and on a remote machine nothing else does.
- Before you hand over, `vibespace-design check` — no ✗ left.

## 6. Look before you hand over

`check` judges structure; it cannot see. Before you hand a design over, look
at the main artboards yourself — the ones the user will judge first, not
every state (each look costs a picture's tokens):

- `vibespace-design preview <file>` prints an address and the artboard's
  size; open it with `vibespace-browser`, set the viewport to that size, take
  a screenshot;
- look for text that overlaps or is cut off, content that overflows the
  frame, a layout that breaks at that width, contrast too low to read,
  an image that did not load;
- fix what you see, `sync`, reload the same address, look again.

Say in your hand-over that you looked, and at which artboards.

## 7. A design system is a design too

The user asked for a design system (a brand kit, a component library): start
it with `vibespace-design new <slug> --kind system`, from what they point at —
the codebase's stylesheets and components, files, a site. Put every colour,
font size, radius and spacing in tokens.css; write system.md in a few
paragraphs (what it is for, type, colour, components, do / don't); draw one
artboard per component group, using only the tokens, and `check` until no
`not_token` warning is left. Tell the user they can pick it in the chat's
design chip, or make it the default in ⚙ Settings (Default design system).

## 8. Hand over

Say, in your reply:

- the design's folder (its absolute path — the chat makes it a link);
- what each artboard is, in a line each;
- the choices you made: static or prototype, the direction, which of the
  project's tokens and components you matched, what you assumed;
- what you would do next, if anything.

Publish only when the user asks for a link — `vibespace-design publish`
asks them anyway — and then write the `/p/<id>` path it prints exactly as
printed.

The user hands the design to ANOTHER agent or developer ("hand this over",
"write it up for the build") → write `HANDOFF.md` in the design folder:
the reading order of the artboards, the decisions and why, the tokens
(colours, type, spacing, radius) by value, what is static and what is
interactive, and the open questions. The Design window's ⋯ "Copy hand-off
prompt" gives the user the words that point another agent at the folder and
that file.

Do not reach for other design tools here: no account-bound artifact or
canvas services, no template languages, no extracted helper scripts. Plain
HTML in the folder is the whole format.

## 8. Decks, and designs that get presented or printed

The user asks for slides, a deck, a pitch, or says they will present or print
the design → make it presentable from the start:

- one artboard per slide, EVERY slide the same size — 1920×1080 (or 1280×720)
  — with `"print": "fixed"`; the window's ▶ Present shows each one whole and
  fitted, and Print with nothing open makes one PDF page per artboard;
- place the slides in READING order: `add` puts them left to right in one
  row; hand-placed rows read top to bottom, each left to right. A long deck
  in sections = one design.json page per section (Present shows the page
  the user is on);
- a slide is read from across a room: body text 28 px or more at 1920 wide,
  one idea per slide, the title in the same place on every slide;
- nothing on a slide needs a click to be seen (Present shields the frames: a
  click steps to the next slide), and nothing depends on hover;
- say in your hand-over how to present (▶ Present, or the published link
  with `#present`) and how to get the PDF (Print, then Save as PDF).
