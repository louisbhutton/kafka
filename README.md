# Kafka

A minimal, zen, keyboard-first notes + calendar app. SQLite storage, Tauri
(Rust) backend, Next.js + Tailwind (React) frontend. Designed to live behind
`Super+K` on niri as an instant show/hide dropdown, like a launcher.

**This version changed the frontend stack.** Previous builds used a plain
HTML/CSS/JS frontend with no build step. As of v0.2, the frontend is a real
Next.js app (static-exported) styled with Tailwind, because the Cron-style
drag-to-create calendar, command palette, and glass sidebar needed real
component state. That means **you now need Node/npm** to build Kafka — see
below.

---

## 1. Install build dependencies (CachyOS / Arch)

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg patchelf rust nodejs npm
```

## 2. Install frontend dependencies

```bash
cd kafka/frontend
npm install
```

## 3. Build

```bash
cd kafka/src-tauri
cargo build --release
```

`cargo build` automatically runs `beforeBuildCommand` (`npm run build` in
`frontend/`, which does a Next.js **static export** to `frontend/out/`) before
compiling the Rust binary — see `tauri.conf.json`. First build will take a
few minutes (compiling `rusqlite`'s bundled SQLite + webkit bindings, plus the
Next.js build).

The binary lands at `src-tauri/target/release/kafka`. Install it:

```bash
sudo cp target/release/kafka /usr/local/bin/kafka
sudo cp ../kafka.desktop /usr/share/applications/kafka.desktop
sudo mkdir -p /usr/share/icons/hicolor/128x128/apps
sudo cp icons/128x128.png /usr/share/icons/hicolor/128x128/apps/kafka.png
```

Data is stored per-user at `~/.local/share/com.kafka.notes/kafka.db` (standard
Tauri app-data path), so multiple users on the same machine get separate
notes. Rebuilding the frontend never touches this file.

### Developing (hot reload)

```bash
cd kafka/src-tauri
cargo tauri dev
```

This runs `beforeDevCommand` (`npm run dev` in `frontend/`, a normal Next dev
server on `localhost:3000`) and points the Tauri window at it (`devUrl`), so
you get hot reload on the frontend while iterating.

## 4. niri config

Add to `~/.config/niri/config.kdl`:

```kdl
binds {
    Mod+B { spawn "kafka"; }
}

window-rule {
    match app-id="kafka"
    open-floating true
    default-column-width { fixed 1180 }
    default-window-height { fixed 720 }
}

spawn-at-startup "kafka" "--hidden"
```

Reload niri config (`niri msg action reload-config`).

**How the toggle works:** Kafka uses `tauri-plugin-single-instance`. Every
time `spawn "kafka"` runs, if an instance is already alive it just
shows/hides the existing window instead of opening a second one. `Esc`
inside the app also hides it (without quitting) — unless a panel/palette is
open, in which case `Esc` closes that first.

## 5. noctalia shell

No noctalia-specific config is required — the `.desktop` file installed in
step 3 is enough for noctalia's app drawer/launcher to show and pin Kafka.

---

## What's inside

- **Zen aesthetic** — an ultra-slim, collapsible left sidebar; glass panels
  (`backdrop-blur`) over a muted single dark palette; no emojis; micro-
  animated SVG icons (`lucide-react`) throughout.
- **Global zoom** — `Ctrl/Cmd + scroll wheel` anywhere smoothly rescales the
  whole UI (adjusts root font-size; everything is sized in rem so it scales
  together).
- **Cron-style calendar** — a real time-blocked `events` table (date +
  start/end time + color + optional linked note), not just all-day markers.
  - **Week view**: click-drag directly on the grid to create an event,
    snapping to 15-minute increments. Clicking an existing event slides out
    the right-hand event panel instead of an in-place popup.
  - **Month view**: a zen overview grid; double-click a day to jump into its
    week/time-grid.
  - **Dual timezone**: toggle a second hour-label column (via the globe
    icon in the calendar header) showing any common IANA timezone next to
    your local one.
  - **Right-click** anywhere on the grid for a minimal context menu: new
    event at that time, or a new note linked to that date.
- **Command palette** — `Cmd/Ctrl + K` opens a fuzzy launcher: jump to
  Today, create an event, toggle Week/Month, or live-search notes.
- **Shortcuts** (ignored while typing in a field): `C` new event, `T` jump
  to today, `W` week view, `M` month view, `Esc` closes the topmost
  panel/palette (or hides the window if nothing's open).
- **Today dashboard** — a live clock, today's schedule (read-only list of
  today's time blocks), a **distinct, prominent `+ Task` button** (separate
  from the calendar's `+ Event` control and the `C` shortcut), and today's
  linked notes with an elegant hover state that opens straight into the
  note panel — no page reload.
- **Notes** — Obsidian-style linking (click to link, no `[[bracket]]`
  syntax) and local file/PDF attachments via the native file picker (Kafka
  stores the *path*, not a copy). The note editor is a right-hand slide-out
  panel, matching the event panel's pattern, so it never covers the
  calendar grid it was opened from.
- **Decluttered on purpose**: no Journal tab, no levels/EXP/streaks — this
  pass removed both the gamification layer and the daily journaling feature
  entirely (frontend *and* backend) per the redesign brief.
- **Storage** — local SQLite, no network calls, no telemetry.

### On the "cross-platform sync" ask

Right now everything lives in one local SQLite file
(`~/.local/share/com.kafka.notes/kafka.db`) with no sync layer. If you want
PC↔mobile sync or cloud backup later, the realistic path is a Tauri Mobile
build sharing this Rust core against a different local DB, plus a small
sync/CRDT layer reconciling the two — a genuinely separate project phase,
not a config flag.

## Project layout

```
kafka/
├── src-tauri/                Rust backend (Tauri v2)
│   ├── src/main.rs           commands, window/toggle behavior, file picker
│   ├── src/db.rs             SQLite schema + queries (tasks, notes, links, files, events)
│   ├── tauri.conf.json       now points build.frontendDist at ../frontend/out
│   └── icons/
├── frontend/                 Next.js + Tailwind (React) frontend — has its own build step
│   ├── app/                  layout.tsx, page.tsx, globals.css
│   ├── components/           Sidebar, CommandPalette, calendar/, dashboard/, notes/
│   ├── store/                AppStateContext.tsx — global state (React context + reducer)
│   ├── hooks/                useZoom.ts, useKeyboardShortcuts.ts
│   ├── lib/                  tauri.ts (typed invoke wrapper), dateUtils.ts, types.ts, holidays.ts
│   ├── next.config.js        output: "export" — required so Tauri can load static files
│   ├── tailwind.config.ts    zen color tokens + glass utilities
│   └── package.json
└── kafka.desktop
```

## Notes on the current build

- `tauri.conf.json`'s `build` block now has `beforeDevCommand` /
  `beforeBuildCommand` pointing at the `frontend/` npm scripts, and
  `frontendDist` points at `frontend/out` (the Next static export), not a
  `src/` folder of hand-written HTML anymore.
- `next.config.js` sets `output: "export"` — this is required for Tauri to
  load the frontend as local files rather than needing a running Next
  server in production. Don't remove it.
- The backend's `events` table replaced the older all-day `custom_events`,
  `day_colors`, `journal_entries`, `focus_sessions`, and `user_stats` tables
  from the previous iteration — those and their commands were deleted along
  with the journal tab and gamification UI they powered.
- Holiday dates (`frontend/lib/holidays.ts`) are for 2026 specifically
  (lunar/BS-calendar-based holidays shift each Gregorian year) — re-check
  official sources and update when the app rolls into 2027.
- Window starts centered and undecorated (frameless), same as before;
  niri's `window-rule` just sets the *default* floating size.
