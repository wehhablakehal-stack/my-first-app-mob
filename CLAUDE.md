# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm run dev       # Vite dev server; prints the URL (5173 is often taken → falls back to 5174)
npm run build     # production build to dist/
npm run preview   # serve the built dist/
npx prettier --write .   # no lint script; .prettierrc = single quotes, printWidth 80, tabWidth 2
```

There is no test framework in this project — no test runner, no test files, no `test` script. Don't invent one when asked to "run the tests"; say so.

Syntax-check before claiming JS works: `node --check src/main.js`. SVG assets are worth validating too, since a malformed one fails silently in the browser: `[xml](Get-Content public/foo.svg -Raw)` in PowerShell throws on bad XML.

### Seeing a change actually render

Chrome is installed **per-user** at `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe` (not in Program Files). A plain headless screenshot only captures the home screen; app views need a click, and the phone body scrolls internally, so `--window-size` alone won't reveal the lower widgets. Drive it over the DevTools protocol instead — launch with `--headless=new --remote-debugging-port=9222`, then `Runtime.evaluate` to click (`document.querySelector('[data-app="learn"]').click()`) and to set `document.querySelector('#app-learn .app-body').scrollTop`, and `Page.captureScreenshot` between steps.

## Architecture

A browser simulation of an iPhone 17 Pro Max: a CSS phone chassis containing a home screen, a lock screen, and ten apps. No framework, no router, no bundled dependencies — Vite and Prettier are the entire toolchain. Three files hold everything: `index.html` (~450 lines), `src/main.js` (~2100), `public/style.css` (~750).

**Every screen already exists in the DOM.** `index.html` ships the home grid, all ten app views, and the lock screen as static markup. Navigation only toggles an `.open` class; the iOS zoom transition is pure CSS (`public/style.css:487`). Do not introduce a templating layer — add markup to `index.html` and wire it up. Dynamic lists (photos, files, courses, playlist) are built with `createElement` + `textContent`, never `innerHTML` with interpolated data.

**`main.js` is a flat sequence of self-contained `setup*()` functions**, each defined then immediately invoked at module scope:

| Function | Line | Covers |
|---|---|---|
| `setupCounter` | 1 | counter app |
| `setupNavigation` | 38 | opening/closing app views |
| `setupPhotos` | 83 | photos + live camera (getUserMedia) |
| `setupWidgetEditing` | 690 | long-press jiggle, drag-reorder |
| `setupFiles` | 809 | real folder browsing (File System Access API) |
| `setupSettings` | 1140 | wallpaper, theme, 24h clock, resets |
| `setupMusic` | 1260 | صوت الحق player: ID3 parsing, Web Audio graph |
| `setupLearn` | 1656 | EduLearn dashboard |
| `setupScreensaver` | 2018 | idle lock screen |

They close over their own DOM refs and state and don't import from each other. The two cross-boundary cases use **shared hook objects declared at module top**: `cameraControls` (start/stop the webcam) and `navControls` (open an app from the lock screen). When a new feature needs to reach into another, add a hook there rather than exporting internals or reaching through globals.

`updateClock()` (line 1115) is the one shared renderer — it feeds the status bar, the home greeting, and the lock screen clock, and it respects the `clock24` setting. Anything showing time hooks into it.

### Layering

`.app-view` is `position: absolute` over the full screen at `z-index: 15`. Anything meant to sit above an open app needs a higher one: status bar 25, home indicator 25, lock screen 28, Dynamic Island 30. The phone is a fixed 400×860px box — `.app-body` scrolls internally, the page never does.

### Persistence

State is in `localStorage`, one key per concern, all prefixed `ios-dashboard-*` except EduLearn's single JSON blob under `edulearn-state`:

```
-photos / -media / -photos-deleted   -widget-order      -files-sort / -files-path
-clock24   -theme   -wallpaper       -playlist / -last-track   -volume
```

Every read and write is wrapped in `try/catch` — private browsing throws on access. **Binary data never goes here**: audio files and captured photos live in IndexedDB, and `localStorage` holds only the metadata pointing at them.

`setupWidgetEditing` restores a saved order by re-appending known widgets, so a **newly added widget isn't in a returning user's saved order and floats to the top of the grid**. Expected, not a bug.

### EduLearn specifics

Its seven widgets display *computed* values, not literals: subject percentages are averages over the 12 seeded courses, and the streak is derived by walking backwards day-by-day through a map of studied dates — a missed day breaks the chain on its own, so there is no reset logic to maintain. Changing seed data changes every displayed number.

## Conventions

Two-space indent, single quotes, semicolons. Comments are lowercase and short, and explain *why* (`// mirror the current track onto the home widget`). Colors and layout belong in CSS; JS only sets computed values (bar widths, ring `stroke-dashoffset`).

The UI is mixed-language by design, and each area is consistent within itself: the base iOS shell is English, the EduLearn app and lock screen are **French** (including their code comments), and the music app is branded **صوت الحق** in Arabic. Match the surrounding area rather than normalizing. Arabic text needs an explicit font stack — the bundled JetBrains fonts have no Arabic glyphs — and elements that show both Arabic and Latin content (track titles, artist names) use `dir="auto"` rather than `dir="rtl"`.
