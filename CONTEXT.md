# TrainTrack — Full Development Context & Handoff Document

> **Purpose:** Every LLM or developer starting a new session on this project must read this file first.
> It is the single authoritative source of what happened, why decisions were made, what broke,
> what was fixed, and what to do next. Git log alone cannot tell you the "why."

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| App name | TrainTrack |
| Description | Zero-ads, zero-framework Mumbai Local + Metro train tracker PWA |
| Live URL | https://oshwetank.github.io/TrainTrack/ |
| Repo | https://github.com/oshwetank/TrainTrack |
| Current version | **v1.5.3** |
| Stack | Vanilla ES6+, CSS custom properties, Service Worker, IndexedDB |
| Deploy | GitHub Pages from `main` branch — push to main = live in ~60 seconds |

### What the app does
- Shows next departures for Mumbai Local (Western, Central, Harbour, Trans-Harbour) and Metro (Line 1 Aqua, 2A Red, 7 Yellow) lines
- Saves favourite journeys, shows departure countdowns, sends walk-time alerts via Notification API
- Works fully offline after first load (Service Worker + IndexedDB cache)
- Hydrates train cards with live delay data via a Cloudflare Worker proxy to RailRadar API (best-effort; failures are silent)

---

## 2. Non-Negotiable Rules

These rules are the law. Breaking them creates bugs that are very hard to trace.

1. **No JavaScript frameworks.** Vanilla ES6+ only. No React, Vue, npm packages.
2. **All CSS color values must use design tokens.** No hardcoded hex values outside `css/design-system.css`. Run `grep "#" css/*.css` to check — only design-system.css should have hex values.
3. **`schedules.json` is read-only.** Never modify it directly. Use `data_updater.js` in `scripts/`.
4. **Every network request must have an 8-second timeout.** Use `timeoutSignal(8000)` from `js/utils/dataUtils.js`.
5. **One HTML file.** All views render inside `index.html`. No new HTML pages.
6. **No new files without confirming with the user first.**
7. **Never commit to a branch other than `main`** (or a feature branch the user explicitly creates).
8. **The bottom nav `<nav class="bottom-nav">` must remain OUTSIDE `.home-container`** in `index.html`. This was the root cause of the v1.5.0–v1.5.2 routing bug — see Section 6.

### CSS import order in `css/styles.css` — ORDER MATTERS

```
design-system.css   ← tokens only, no rules
components.css      ← shared UI components
home.css            ← home view + bottom nav styles
journey-tracker.css ← journey tracker view
search.css          ← search overlay
alerts.css          ← alerts + settings views + stop-dot styles
legacy.css          ← INTENTIONALLY EMPTY — do not add rules here
```

**Critical:** If you ever add a new CSS file, import it BEFORE `legacy.css`. If you add rules TO `legacy.css`, they will override everything above (same as when the file was full — that was the v1.5.0–v1.5.2 root bug).

---

## 3. File Map

### Root files

| File | Role | Edit? |
|------|------|-------|
| `index.html` | App shell — all views, single page | Yes — carefully |
| `sw.js` | Service Worker — caching, push, background sync | Yes — bump `CACHE_VERSION` on every deploy |
| `manifest.json` | PWA manifest — icons, display, shortcuts | Rarely |
| `schedules.json` | Static train timetable (154 trains, 4 lines) | NEVER directly — use `scripts/data_updater.js` |
| `disruptions.json` | Static disruption alerts (5 items) | Update for real disruptions |

### `css/` files

| File | Role |
|------|------|
| `design-system.css` | All CSS custom property tokens. THE ONLY FILE with hex values. |
| `components.css` | Shared components: badges, cards, loading spinners, buttons, journey chips |
| `home.css` | Home view, hero card, line tabs, train list, bottom nav CSS |
| `journey-tracker.css` | Journey tracker view — timeline, ETA display, SOS/notify buttons |
| `search.css` | Full-screen search overlay |
| `alerts.css` | Secondary views (alerts + settings), alert cards, toggle switches, walk-time stepper, stop-dot timeline |
| `legacy.css` | **Empty.** Keep it empty. File must exist for SW cache. |

### `js/app.js` — the core module

The entire app lives in one IIFE that exposes `window.TrainTrack`. Internal modules:

| Module | What it does |
|--------|-------------|
| `TrainTrack.Config` | Frozen constants — API URLs, localStorage keys, IDB config, version, line IDs |
| `TrainTrack.Store` | localStorage (prefs, favourites) + IndexedDB (schedule cache) |
| `TrainTrack.API` | Stale-While-Revalidate fetch wrapper. `loadSchedules()`, `fetchLiveArrivals()`, `fetchTrainLive()`, `hydrateBatch()` |
| `TrainTrack.Search` | O(n) prefix-match station autocomplete. Call `Search.index(data)` on boot, then `Search.query(text)` |
| `TrainTrack.App` | `boot()` — init sequence. `_renderHome()`, `_renderSavedJourneys()`, `_updateCountdowns()` |

### `js/components/`

| File | Role |
|------|------|
| `bottomNav.js` | Wires bottom nav clicks → shows/hides views. Exports `initBottomNav()` and `setActiveViewToHome()` |
| `trainCard.js` | `createTrainCard(train, opts)` — returns a `<div>` with live-update method |
| `journeyTracker.js` | Full-screen journey tracker. `initJourneyTracker(train, backCallback)`, `renderJourneyTimeline(train)`, `updateETA()` |
| `alertsView.js` | Async loads `disruptions.json`, renders alert cards into container |
| `settingsView.js` | Renders settings controls (toggles, walk-time stepper) with localStorage persistence |
| `searchUI.js` | Full-screen search overlay. Recent searches via localStorage, autocomplete via `Search.query()` |

### `js/utils/`

| File | Role |
|------|------|
| `timeUtils.js` | `getGreeting()`, `calculateCountdown(HH:MM)` → "45 minutes"/"Departed"/"Departing now", `parseTimeString()`, `formatTime()`, `calculateETA()` |
| `dataUtils.js` | `getNextDepartures(trains, station, limit)` — 2-hour filter, `sortTrainsByDeparture()`, `filterTrainsByRoute()`, `escapeHTML()`, `timeoutSignal(ms)` |

### `proxy/`

Cloudflare Worker that proxies requests to RailRadar API, adding CORS headers. Deployed at `traintrack-proxy.oshwetank.workers.dev`. The `RAILRADAR_BASE` in `Config` points here.

---

## 4. Design System — Amber Dawn

All tokens live in `css/design-system.css`. Use these — never hardcode.

### Brand & Backgrounds
```
--primary:       #E55934   ← terracotta (Western line + brand colour)
--primary-dark:  #7A3F25   ← WCAG AA on light; use for text/borders over --primary
--primary-light: #FAC9BB   ← light tint; use ONLY as a background, never for text
--background:    #FDFBF7   ← warm off-white app background
--surface:       #FFFFFF   ← card/panel background
--surface-low:   #F5F3EE   ← slightly tinted; used for input backgrounds, chips
```

### Line Colours (what shows on tabs and card left borders)
```
--western:       #E55934   ← orange-red
--central:       #B91C1C   ← dark red
--harbour:       #1D4ED8   ← blue
--trans-harbour: #15803D   ← green
--metro-aqua:    #009688   ← teal (Metro Line 1)
--metro-red:     #E53935   ← bright red (Metro 2A)
--metro-yellow:  #F9A825   ← amber (Metro 7)
```

### Status & Tints
```
--success: #38B000 | --success-tint: #D1FAE5
--warning: #F57C00 | --warning-tint: #FEF3C7
--danger:  #D32F2F | --danger-tint:  #FEE2E2
           --info-tint:    #EDE9FE
           --neutral-tint: #F3F4F6
```

### Typography
```
--font-heading: 'Outfit', system-ui       ← all h1–h6
--font-body:    'Be Vietnam Pro', system-ui ← all body text
```
Fonts loaded from Google Fonts via `@import url(...)` in `css/styles.css`.

### Spacing & Radius
```
--space-xs: 4px | --space-sm: 8px | --space-md: 16px | --space-lg: 24px | --space-xl: 32px
--radius-sm: 4px | --radius-md: 8px | --radius-lg: 24px | --radius-full: 9999px
```

---

## 5. Development Timeline

### March 2026 — Project Start (v0 → v1.2)

**What happened:** Project started as "Antigravity" and was renamed to TrainTrack. The first meaningful codebase was a monolithic `app.js` with inline HTML templates, a single CSS file, and a basic Service Worker.

Key early decisions:
- **Single `window.TrainTrack` namespace IIFE** — chosen so DevTools inspection is easy with no bundler. `window.TrainTrack.Store`, `.API`, `.Search` etc. are all accessible from the console.
- **IndexedDB for schedule cache** — `schedules.json` is 150KB+ uncompressed. IDB stores it so second load is instant even on 2G.
- **Cloudflare Worker proxy** — RailRadar API has no CORS headers. The proxy at `traintrack-proxy.oshwetank.workers.dev` adds them. Without it, all live data calls fail in the browser.
- **`schedules.json` as static seed** — the app always renders from static data first, then hydrates live. This means the app is always usable, even with zero connectivity.

Bug encountered: Station codes in `schedules.json` didn't match what RailRadar's API expected. Fixed by cross-referencing IR station code database.

### April 7, 2026 — v1.3 & v1.4

**What happened:** Feature expansion — 150+ trains, platform numbers, disruption tracking, crowd estimation, SOS contacts, mega-block banner, leave-by calculator.

Key decisions:
- **`disruptions.json`** as a separate static file for service alerts — keeps `schedules.json` focused on timetable data.
- **SW cache version bumping** — discovered that returning users see old cached code if you don't bump `CACHE_VERSION` in `sw.js`. This is a recurring trap: every deploy with CSS/JS changes MUST bump the cache version or old users see broken UI.
- **IDB_VERSION** — if you change the IndexedDB schema, you must bump `Config.IDB_VERSION` or Chrome silently ignores the `onupgradeneeded` handler.

### April 11–14, 2026 — Amber Dawn Redesign (v1.4.1 → v1.5.0 pre-release)

**What happened:** A major UI overhaul was started — "Amber Dawn" design system replacing the original dark-theme design. This is where the CSS file split happened (design-system.css, components.css, home.css, etc.).

**Critical mistake made here:** During the redesign, `legacy.css` was created to hold old rules while the new files were being written. The file was added as the LAST import in `styles.css`. As new rules were added to `home.css`, `components.css` etc., `legacy.css` silently overrode all of them because it came later in the cascade. This was not discovered until v1.5.3.

Key architectural decisions made:
- **ES module split** — `app.js` now imports from `js/components/` and `js/utils/` modules. The IIFE still wraps everything but ES module imports are at the top.
- **`escapeHTML()` on all user-visible strings** — XSS protection. Every string from `schedules.json` that goes into `innerHTML` must be escaped.
- **`data-departure` attribute for countdowns** — instead of re-rendering entire train cards every 60 seconds, departure times are stored as `data-departure="HH:MM"` attributes. `_updateCountdowns()` reads these and updates only the text nodes. Zero DOM re-renders for updates.

### April 14, 2026 — v1.5.0 Release

**What happened:** First "complete" version shipped with all features: Western/Central/Harbour/Trans-Harbour + 3 Metro lines, search, recent searches, saved journeys, alerts view, settings view, journey tracker, notification API.

**Bug discovered post-release:** Search module (`Search.index()`) was being called before `schedules.json` loaded. Fixed by ensuring `Search.index(data)` is called inside the `loadSchedules()` callback, not in a separate `DOMContentLoaded` handler.

### April 25–26, 2026 — v1.5.1 & v1.5.2

**What happened:** A live audit revealed multiple issues. A hotfix patch (v1.5.1) addressed crashes and dark mode. Then v1.5.2 implemented a larger UI overhaul: conic-gradient countdown ring on hero card, countdown pills on train cards, line-coloured border stripes, better search styling, journey badge improvements.

**Why v1.5.2 still looked broken in the live test:** The changes were correct in the source files, but `legacy.css` (imported last) was overriding the new CSS. The live tester at 3 AM saw old styles. The SW cache version was bumped to v1.5.2 in `sw.js` but `Config.VERSION` in `app.js` still said `v1.5.0`. Version inconsistency everywhere.

The live test also revealed a routing bug: Alerts and Settings views were "appending below" the home view instead of replacing it.

### April 26, 2026 — v1.5.3 Root Cause Audit

**What happened:** Full audit of every file revealed 9 compounding bugs. All fixed in a single commit.

**The 9 bugs and why they happened:**

1. **`legacy.css` imported last** — entire alternate design system ("Kinetic Nocturne") overrode `--primary` (amber vs terracotta), all train card styles, nav styling, fonts. Every CSS improvement from v1.5.2 was invisible. Fix: emptied `legacy.css`.

2. **`<nav class="bottom-nav">` inside `.home-container`** — `display: none` on a parent hides ALL descendants, including `position: fixed` children. So hiding home for Alerts/Settings hid the navigation bar. Fix: moved nav outside home-container in `index.html`.

3. **`_hideAll()` never reset secondary view display to `none`** — secondary views stayed `display: block` (invisible via opacity) after first navigation, taking up layout space below home content ("append below" bug). Fix: added `el.style.display = 'none'` in `_hideAll()`.

4. **`LINE_COLORS` in `Config` had wrong values** — `western: '#3b82f6'` (blue) instead of `'#E55934'` (terracotta). Completely wrong. And the map was never used anywhere in the code. Fix: removed it.

5. **Pseudo-element stop dots conflicting with real elements** — `journey-tracker.css` used `::before` pseudo-elements to render timeline dots, but `journeyTracker.js` renders real `<div class="stop-dot">` elements. Both showed up simultaneously — two dots per stop. Fix: removed `::before` rules from journey-tracker.css.

6. **`.empty-hero` defined in both `components.css` and `home.css`** — conflicting properties. `components.css` set `color: var(--text-secondary)` (gray), which interfered with `home.css`'s white text on the orange hero card. Fix: removed from `components.css`.

7. **`.train-type-badge` had white text on `var(--primary-light)` background** — `#FAC9BB` (light pink) with white text = WCAG contrast fail. Fix: changed background to `var(--primary)`.

8. **Hardcoded hex values throughout `alerts.css`, `components.css`, `journey-tracker.css`** — violated the design token rule. Fix: replaced with `--danger-tint`, `--warning-tint`, `--success-tint`, `--info-tint`, `--neutral-tint` (added to design-system.css).

9. **Version mismatch: SW=v1.5.2, Config=v1.5.0, Settings=v1.5.0** — inconsistent. Fix: all set to `v1.5.3`. SW bumped to `traintrack-v1.5.3` cache key.

---

## 6. Known Landmines — Read Before Editing

### Landmine 1: SW cache version
Every time you change CSS or JS, you MUST bump `CACHE_VERSION` in `sw.js` AND `Config.VERSION` in `app.js` AND `APP_VERSION` in `settingsView.js`. All three must match. Without this, returning users see old cached code.

How the SW update works: old SW stays active until ALL tabs are closed. New SW installs but waits. On next tab open after all tabs closed, new SW activates and deletes old caches. First hard refresh after a deploy does NOT guarantee new code — user must close all tabs.

### Landmine 2: CSS import order
`legacy.css` is imported last in `styles.css` and is intentionally empty. If you add rules to it, they will override everything. If you need a new CSS file, import it BEFORE `legacy.css`. The rule: **later in the cascade = wins**.

### Landmine 3: `display: none` on a parent hides position: fixed children
CSS spec: `display: none` removes an element from rendering entirely, including all descendants even if they have `position: fixed` or `position: absolute`. This is why the bottom nav must be a SIBLING of the view containers, not a child of any of them.

### Landmine 4: The `getNextDepartures()` function
When `prefs.from` is null (new user, no station selected), `_renderHome()` falls through to `allTrains.slice(0, 5)`. This shows the first 5 trains in the JSON regardless of time — some may have departed. This is expected behavior for a new user. The fix is not to change this logic — it is to prompt new users to select a station via Search.

### Landmine 5: `calculateCountdown()` returns a string with words
`calculateCountdown("12:30")` returns `"45 minutes"`, not `45`. In `_updateCountdowns()`, use `parseInt(raw, 10)` to extract the number. `parseInt("45 minutes", 10)` = 45. `parseInt("Departed", 10)` = NaN. Always check `isNaN()` before using the numeric value.

### Landmine 6: Journey tracker and home-container
When a train card is clicked, `app.js` hides home-container and shows `#journeyTracker`. After the nav was moved outside home-container (v1.5.3), hiding home-container no longer hides the nav — the nav remains visible. But the journey tracker does not use the `bottomNav.js` view system — it manages its own show/hide directly. If a user is in the journey tracker and clicks the bottom nav, it goes through `bottomNav.js` and calls `_hideAll()`, which will hide `#journeyTracker` correctly (it's in the `forEach` list).

### Landmine 7: Safari / PWA
Safari has different SW update semantics. On iOS, users must remove and re-add the home screen icon to get the newest SW. This is a browser limitation, not an app bug.

---

## 7. Current Feature Status (after v1.5.3)

### Working correctly
- App shell loads on warm off-white background
- Line tab switching — all 7 lines — with correct colour pills
- Active tab persists across page reload (saved to localStorage)
- Search overlay — full-screen, autocomplete, recent searches (greyed, no header)
- Service Worker — registered, caching active, correct v1.5.3 cache
- Bottom nav — Home / Alerts / Settings all navigate correctly, nav always visible
- Alerts view — loads `disruptions.json`, 5 real cards with severity badges
- Settings view — toggles, walk-time stepper, theme toggle, version display
- Saved journeys — bookmark, swap direction, remove, line colour dot
- Countdown pills on train cards — selective DOM update, no full re-render
- Hero card conic-gradient ring — fills as train approaches departure
- Line-coloured left border stripes on train cards
- Page Visibility API — polling pauses when app is backgrounded
- Design system: terracotta primary colour (#E55934) now correct throughout

### Needs daytime testing (trains only run 05:00–00:30)
- Train card rendering at a live departure time (line stripe, countdown, platform)
- Hero card ring countdown with a real upcoming train
- Save/unsave journey bookmark
- Journey tracker timeline (stop progression, ETA display)
- SOS button (calls 182 — RPF emergency)
- Notify Family WhatsApp share

### Known remaining issues
- **Empty state when no station is selected**: shows first 5 trains from JSON regardless of current time. Some may show "Departed". Expected for new users — prompt them to search for a station.
- **Journey tracker + bottom nav**: if user opens a train's journey tracker and then clicks bottom nav Alerts, the journey tracker keeps running in background (tracking interval still active). Minor UX gap — back button on journey tracker cleans it up.

---

## 8. What To Do Next

Priority order for the next session:

### P0 — Daytime re-test
Do a full live test between 06:00–22:00 IST when Mumbai Local trains run. Verify:
- Train cards render with line stripe and countdown pill
- Hero card shows ring with real countdown
- Bookmark a journey and reload — verify it persists and loads correctly
- Open a journey tracker — verify timeline advances, back button works

### P1 — Design improvements (user approved)
The user has explicitly said: "follow the best design which is possible while keeping the app light and fast." (Retracted the earlier "keep layout minimal" instruction.)

Good candidates:
- **Skeleton loading screens** instead of the spinner — shimmer cards while `schedules.json` loads
- **Better empty state when no station selected** — prompt with a CTA to tap Search
- **Hero card when empty at night** — make the 3 AM empty state more informative (show first morning train)
- **Max-width container on desktop** — constrain `.home-container` and `.secondary-view` to 640px and centre them so the app looks good on desktop
- **Gradient or subtle pattern on the hero card** — currently solid terracotta; a subtle pattern would add depth

### P2 — Data
- Add more trains to `schedules.json` (currently 154 — missing some late-night and morning services)
- Add actual Metro station data (current Metro lines have placeholder stop codes)

### P3 — PWA features
- Install prompt / "Add to Home Screen" nudge for first-time visitors
- Notification permission prompt that explains the value before asking

---

## 9. How to Test

### Local development server
```bash
cd TrainTrack
npx serve . --listen 3737
# Open http://localhost:3737 in Chrome
```
Chrome DevTools → Application → Service Workers → check "Bypass for network" during development. This ensures you always see your latest JS/CSS without needing to bump the SW version.

### Live site
https://oshwetank.github.io/TrainTrack/

After a `git push origin main`, GitHub Pages deploys in ~60 seconds. To see changes without SW cache:
1. Chrome DevTools → Application → Service Workers → "Unregister"
2. DevTools → Application → Storage → "Clear site data"
3. Hard refresh (Ctrl+Shift+R)

### Quality gate checklist (run before every push)
- [ ] No JS errors in Chrome DevTools console
- [ ] App loads in < 2 seconds on Fast 3G (Network tab throttling)
- [ ] Offline: disable Network, reload → last data shows, no white screen
- [ ] `schedules.json` is still valid JSON (`node -e "require('./schedules.json')"`)
- [ ] PWA: DevTools → Application → Manifest and Service Worker both green
- [ ] No horizontal scroll at 375px viewport width
- [ ] `grep -n "#" css/*.css` shows hits ONLY in `css/design-system.css`
- [ ] All 7 line tabs switch correctly with right colours
- [ ] Bottom nav Home → Alerts → Settings → Home cycle works, nav always visible

---

## 10. Commit Format

```
type(scope): brief description

Types:  feat | fix | refactor | style | docs | test | chore
Scopes: onboarding | search | tracker | alerts | saved | design | api | sw | data
```

Example: `fix(tracker): stop interval leak when user navigates back from journey view`

---

*Last updated: 2026-04-26 after v1.5.3 root cause audit*
*Maintained by: Claude Sonnet 4.6 + oshwetank*
