# 🚆 TrainTrack — Mumbai Local Train Tracker

**Real-time departures, delays, and platform numbers for Western, Central and Harbour lines.**

> A fully offline-capable **Progressive Web App** built on zero-framework Vanilla JS. Install it directly from your browser — no app store required.

[![Lighthouse PWA](https://img.shields.io/badge/PWA-Ready-f59e0b?logo=googlechrome&logoColor=white)](https://web.dev/progressive-web-apps/)
[![JS Framework](https://img.shields.io/badge/Framework-None-4edea3)](https://github.com/oshwetank/TrainTrack)
[![License](https://img.shields.io/badge/License-MIT-8fd5ff)](LICENSE)

---

## 🌿 Architectural Philosophy: "Walk in the Garden"

TrainTrack was built under the **"Walk in the Garden"** methodology — a phased, compute-efficient approach to PWA development:

| Phase | Name | Principle |
|-------|------|-----------|
| 🌱 **Seed** | App Shell | Establish the HTML/CSS structure before any logic |
| 💧 **Water** | Logic & Integration | Pour modular, async JS into data-binding points |
| ✂️ **Prune** | Optimise | Remove reflow triggers, batch DOM writes in RAF |
| 🌸 **Bloom** | PWA Resilience | Service Worker, offline mode, background sync |

**Core constraint: Extreme Compute Efficiency**
- Zero JS framework — pure `TrainTrack.*` namespace
- All DOM mutations via `requestAnimationFrame` (zero forced reflow)
- CSS animations restricted to `transform` + `opacity` (GPU-composited)
- Polling paused by `Page Visibility API` (battery optimisation)
- `AbortSignal.timeout(8000)` on all outbound API calls

---

## 🏗️ Architecture Overview

```
TrainTrack/
├── index.html          ← App shell (semantic HTML5)
├── css/                ← Amber Dawn design system + screen styles
├── js/                 ← ES modules (`js/app.js` boots `window.TrainTrack`)
├── sw.js               ← Service Worker (4 caching strategies)
├── manifest.json       ← PWA manifest (maskable icons, shortcuts)
├── schedules.json      ← Static seed dataset (Mumbai local timetables)
├── icons/              ← PWA icons (192px, 512px, maskable variants)
└── mcp/
    └── cloud-run/      ← Cloud Run MCP server (GCP service management)
```

---

## 📦 TrainTrack Module Map (`js/app.js`)

The runtime still exposes a single `window.TrainTrack` namespace (easy to debug in DevTools), but the source is split into ES modules for the Amber Dawn UI workstream:

```js
window.TrainTrack = (() => { ... })();
```

### `TrainTrack.Config`
Frozen object of all constants: API endpoints, localStorage keys, IndexedDB config, line colours, and poll intervals. **Single source of truth** — change one value, it propagates everywhere.

### `TrainTrack.Store`
Two-tier persistence:
- **localStorage** — user preferences (line, from/to stations, clock format, auto-refresh) and favourite routes
- **IndexedDB** — `schedules.json` binary cache for instant offline paint on next cold start

### `TrainTrack.API`
Fetch wrapper implementing **Stale-While-Revalidate**:
1. Check in-memory `Map` cache — return immediately if fresh
2. If stale: return cached data instantly, kick off background revalidation
3. If no cache: `await` the network, then populate the cache

RailRadar batch hydration uses `Promise.allSettled` with **per-fetch** `AbortSignal.timeout(8000)` so one slow train cannot abort the rest of the batch.

### `TrainTrack.Search`
O(n) linear scan across the station lists embedded in `schedules.json`. Prefix-matches on both `name` and `code` fields, limited to 8 results, debounced at 120 ms. No trie needed at this data scale.

### `TrainTrack.App`
Bootstrap sequence:
1. **Instant paint** — serve IndexedDB-cached `schedules.json` if available
2. **Background fetch** — re-fetch `schedules.json` from the network, update IDB
3. **UI wiring** — Amber Dawn home + journey tracker screens (in progress)
4. **Live hydration** — per-card RailRadar lookups (best-effort; failures are silent)

---

## ⚙️ Service Worker (`sw.js`)

Four caching strategies mapped to URL patterns:

| URL Pattern | Strategy | Rationale |
|-------------|----------|-----------|
| App shell assets (`/`, `index.html`, `/css/*`, `/js/*`, `manifest.json`, icons) | **Cache-first** | Never changes between deployments |
| `schedules.json` | **Stale-while-revalidate** | Serve instantly, update in background |
| `railradar.in/api/*` | **Network-first + cache fallback** | Fresh data preferred; stale on failure |
| Everything else | **Network-first + cache fallback** | General safe default |

**Background Sync** (`sync-schedules` tag): If the app goes offline mid-session, the SW queues a `schedules.json` refresh. When the connection restores — even if the app is closed — the SW fetches the latest schedule silently.

**Push Notifications**: The SW handles `push` events and `notificationclick` to surface train delay alerts (requires `Notification.requestPermission()` from the user).

---

## 🎨 Design System: "Amber Dawn" (in progress)

Early UI exploration was done in Google Stitch; this repo does **not** embed private Stitch project identifiers.

```css
/* Core Palette */
--bg:         #12121d;  /* Midnight navy */
--primary:    #f59e0b;  /* Electric amber */
--secondary:  #4edea3;  /* On-time green */
--tertiary:   #8fd5ff;  /* Info blue */

/* Line Colours */
--line-western: #3b82f6;  /* Blue */
--line-central: #ef4444;  /* Red */
--line-harbour: #8b5cf6;  /* Purple */
```

**Performance rules enforced in CSS:**
- `will-change: transform` on all composited layers (app header, bottom nav, settings drawer)
- Animations use only `transform` + `opacity` — zero layout-triggering properties
- `backdrop-filter` for glassmorphism (GPU-composited)
- `@media (prefers-reduced-motion)` disables all animations instantly

---

## 🚀 Getting Started

### Run locally
```bash
npx serve . --listen 3737
# Open http://localhost:3737
```

### Install as PWA
1. Open `http://localhost:3737` in Chrome or Safari
2. Click **"Add to Home Screen"** (mobile) or the install icon in the address bar (desktop)
3. TrainTrack runs fully offline after the first load

**iOS note:** Mobile Safari supports PWAs, but **Service Worker update semantics and some background capabilities differ** from Chromium. If something looks “stuck” after a deploy, close all tabs and re-open the site once (or remove/re-add the Home Screen icon) to pick up the latest `sw.js`.

### Deploy to GitHub Pages
```bash
git push origin main
# Enable Pages in repo Settings → Pages → Deploy from main branch
```

---

## 🔌 API Integration

TrainTrack uses [RailRadar](https://railradar.in) as its live data aggregator.

| Endpoint | Usage |
|----------|-------|
| `GET /api/trains/{trainNo}/live` | Per-train delay, current station, platform |
| `GET /api/station/{code}/arrivals` | All arrivals at a station |

All API calls fail **silently** — the UI always renders from the static `schedules.json` first, then hydrates with live data if available. Network errors never crash the app.

To add your own API key:
```js
// js/app.js → TrainTrack.Config
RAILRADAR_BASE: 'https://your-api-proxy.example.com/api',
```

---

## 🗺 Data: `schedules.json`

Static seed dataset with **154 trains** across **4** lines (**163** unique station codes in `schedules.json`):

| Line | Trains |
|------|--------|
| Western | 53 |
| Central | 50 |
| Harbour | 31 |
| Trans-Harbour | 20 |

Departures include platform numbers and wrap-around midnight correctly.

---

## 🧪 MCP Setup

See [`MCP_SETUP.md`](MCP_SETUP.md) for full instructions on wiring the `cloud-run` and `github` MCP servers into Antigravity, including:
- Fix for the missing `google-auth-library` dependency
- No-Docker alternative for the GitHub MCP (`npx` instead)
- Full `mcp_config.json` reference

---

## 📄 License

MIT © 2026 oshwetank
