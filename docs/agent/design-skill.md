# How to design here — the craft rules for vibespace-design

The CLI above puts your HTML in front of the user. These rules are about what
you put there. They are short on purpose; each one exists because skipping it
produces a draft the user throws away.

## 1. Look before you draw

Before the first artboard, search the project the user is working in for what
already decides the look:

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

## 2. Static or prototype — decide, then say it

A **static** design is screens to look at. A **prototype** is screens that
respond: tabs that switch, a menu that opens, a form that validates — driven
by a small inline script inside ONE artboard (frames do not navigate to each
other, so a flow is either states inside one artboard or artboards placed
side by side in reading order).

If the user can answer, ask once which they want. If the request is all you
have — a design request from the chat's design chip is a single turn — choose
yourself and NAME the choice in your reply ("static screens; say if you want
the checkout clickable").

## 3. Directions only when nothing settles the look

When the project has a brand or a design system, draw ONE direction, at full
fidelity, in that system. Only when nothing settles the look (a new product,
a poster, "make it nice") draw two to four low-fidelity directions first —
side by side, one page, each with a short note saying its idea — and let the
user pick before you refine one. Directions differ in their IDEA (dense vs
spacious, playful vs sober, image-led vs type-led), not in a shade of the
same idea.

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

## 5. Every edit starts from the disk

The user may have commented, another agent of the same Task Group may have
changed a file, and your memory of a file is older than the file. So:

- Before EVERY edit, re-read the folder (`vibespace-design show`) and the file
  you are about to change. Edit what is on disk; never rewrite an artboard
  from memory.
- A `[Design comment]` names one element in one file: change that element,
  leave the rest.
- End EVERY edit with `vibespace-design add <file>` (a new artboard) or
  `vibespace-design sync` (a changed one, design.json, an image) — it is what
  repaints the user's window, and on a remote machine nothing else does.
- Before you hand over, `vibespace-design check` — no ✗ left.

## 6. Hand over

Say, in your reply:

- the design's folder (its absolute path — the chat makes it a link);
- what each artboard is, in a line each;
- the choices you made: static or prototype, the direction, which of the
  project's tokens and components you matched, what you assumed;
- what you would do next, if anything.

Publish only when the user asks for a link — `vibespace-design publish`
asks them anyway — and then write the `/p/<id>` path it prints exactly as
printed.

Do not reach for other design tools here: no account-bound artifact or
canvas services, no template languages, no extracted helper scripts. Plain
HTML in the folder is the whole format.
