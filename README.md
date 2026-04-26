# TrainTrack — Mumbai Local + Metro Train Tracker

**Real-time departures, countdown timers, and live delay status for all Mumbai rail lines.**

> A fully offline-capable Progressive Web App built on zero-dependency Vanilla JS.
> Install from your browser — no app store required.

[![Version](https://img.shields.io/badge/version-v1.5.3-E55934?style=flat)](https://github.com/oshwetank/TrainTrack)
[![PWA](https://img.shields.io/badge/PWA-Ready-38B000?logo=googlechrome&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Framework](https://img.shields.io/badge/Framework-None-1D4ED8)](https://github.com/oshwetank/TrainTrack)
[![License](https://img.shields.io/badge/License-MIT-6B6B6B)](LICENSE)

**[Open Live App](https://oshwetank.github.io/TrainTrack/)**

---

## What It Does

- Next departures across **7 rail lines**: Western, Central, Harbour, Trans-Harbour, Metro 1 (Aqua), Metro 2A (Red), Metro 7 (Yellow)
- **Conic-gradient countdown ring** on the hero card — fills up as the train approaches
- **Saved journeys** — bookmark any route, swap direction, one tap to reload
- **Walk-time departure alerts** — notifies you when it's time to leave based on your set walk time
- **Service alerts** — live disruptions from `disruptions.json` with severity badges
- **Full offline mode** — Service Worker + IndexedDB cache; works after first load with no connection

---

## Architecture

```
TrainTrack/
├── index.html              App shell — all views rendered here, single page
├── sw.js                   Service Worker (4 caching strategies)
├── manifest.json           PWA manifest
├── schedules.json          Static timetable seed (154 trains, read-only)
├── disruptions.json        Service alerts
├── css/
│   ├── design-system.css   All CSS tokens — ONLY file with hex values
│   ├── components.css      Shared UI: cards, badges, buttons, chips
│   ├── home.css            Home view, hero card, line tabs, bottom nav
│   ├── journey-tracker.css Journey tracker timeline
│   ├── search.css          Full-screen search overlay
│   ├── alerts.css          Alerts + Settings views, stop timeline
│   └── legacy.css          Intentionally empty — kept for SW cache
├── js/
│   ├── app.js              Core IIFE — Config, Store, API, Search, App
│   ├── components/
│   │   ├── bottomNav.js    View routing (Home / Alerts / Settings)
│   │   ├── trainCard.js    Train card component with live-update method
│   │   ├── journeyTracker.js  Full-screen journey timeline
│   │   ├── alertsView.js   Service alerts renderer
│   │   ├── settingsView.js Settings controls
│   │   └── searchUI.js     Search overlay with recent searches
│   └── utils/
│       ├── timeUtils.js    Greeting, countdown, ETA calculations
│       └── dataUtils.js    Train filtering, escapeHTML, timeoutSignal
└── proxy/
    └── worker.js           Cloudflare Worker — CORS proxy to RailRadar API
```

### Design Philosophy: "Walk in the Garden"

Development follows a phased approach for extreme compute efficiency:

| Phase | Name | Principle |
|-------|------|-----------|
| Seed | App Shell | HTML/CSS structure before any logic |
| Water | Logic & Integration | Modular async JS into data-binding points |
| Prune | Optimise | Remove reflow triggers, batch DOM writes in RAF |
| Bloom | PWA Resilience | Service Worker, offline mode, background sync |

**Core constraints:**
- Zero JS framework — pure `window.TrainTrack.*` namespace IIFE
- All DOM mutations via `requestAnimationFrame` (zero forced reflow)
- CSS animations restricted to `transform` + `opacity` (GPU-composited)
- Polling paused when app is backgrounded (Page Visibility API)
- `AbortSignal.timeout(8000)` on every outbound API call

---

## Design System: Amber Dawn

All tokens are in `css/design-system.css`. No hex values anywhere else.

```css
/* Brand */
--primary:       #E55934;  /* Terracotta — brand + Western line */
--background:    #FDFBF7;  /* Warm off-white */
--surface:       #FFFFFF;  /* Card background */

/* Suburban line colours */
--western:       #E55934;  /* Orange-red */
--central:       #B91C1C;  /* Dark red */
--harbour:       #1D4ED8;  /* Blue */
--trans-harbour: #15803D;  /* Green */

/* Metro line colours */
--metro-aqua:    #009688;  /* Teal — Metro Line 1 */
--metro-red:     #E53935;  /* Bright red — Metro 2A */
--metro-yellow:  #F9A825;  /* Amber — Metro 7 */

/* Typography */
--font-heading: 'Outfit', system-ui;
--font-body:    'Be Vietnam Pro', system-ui;
```

---

## Data: `schedules.json`

Static seed timetable with **154 trains** across **4 suburban lines** (Metro station data is placeholder):

| Line | Trains |
|------|--------|
| Western | 53 |
| Central | 50 |
| Harbour | 31 |
| Trans-Harbour | 20 |

Departures include platform numbers. Wrap-around midnight handled in `getNextDepartures()`.

The file is read-only at runtime. All data updates go through `scripts/data_updater.js`.

---

## Service Worker

Four strategies mapped to URL patterns:

| URL | Strategy | Why |
|-----|----------|-----|
| App shell (HTML, CSS, JS, icons) | Cache-first | Doesn't change between deploys |
| `schedules.json` | Stale-while-revalidate | Serve instantly, refresh in background |
| RailRadar API (`workers.dev/proxy/*`) | Network-first + cache fallback | Live data preferred; stale on offline |
| Everything else | Network-first + cache fallback | Safe default |

**Important:** Every deploy that changes JS or CSS must bump `CACHE_VERSION` in `sw.js`. Without this, returning users keep seeing the old cached version. The SW update lifecycle means users see changes only after closing all tabs and reopening.

---

## API Integration

Live data comes from [RailRadar](https://railradar.in) via a Cloudflare Worker CORS proxy.

All live hydration is best-effort — the app always renders from `schedules.json` first, then hydrates with live delay data if available. Network failures are silent and never crash the app.

```
Proxy: https://traintrack-proxy.oshwetank.workers.dev/proxy
Endpoint: /station/{code}/arrivals  — live arrivals at a station
Endpoint: /trains/{trainNo}/live    — delay + current station for one train
```

---

## Running Locally

```bash
# Serve from root (needed for SW scope)
npx serve . --listen 3737

# Open in Chrome
open http://localhost:3737
```

During development, enable "Bypass for network" in Chrome DevTools → Application → Service Workers. This skips the SW cache so you see your latest code without bumping the cache version.

### Deploy

```bash
git push origin main
# GitHub Pages deploys automatically in ~60 seconds
```

### Install as PWA

1. Open the live URL in Chrome or Safari
2. Chrome desktop: click the install icon in the address bar
3. Mobile: "Add to Home Screen" from the browser menu

---

## Contributing

See `CONTEXT.md` for a full developer handoff document — architecture decisions, the complete development timeline with lessons learned, known landmines, and the next steps roadmap.

---

## License

MIT &copy; 2026 oshwetank
