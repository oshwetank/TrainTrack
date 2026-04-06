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
├── index.html          ← App shell (semantic HTML5, <template> elements)
├── styles.css          ← "Kinetic Nocturne" design system (CSS custom properties)
├── app.js              ← Single TrainTrack namespace (7 modules, IIFE)
├── sw.js               ← Service Worker (4 caching strategies)
├── manifest.json       ← PWA manifest (maskable icons, shortcuts)
├── schedules.json      ← Static seed dataset (Mumbai local timetables)
├── icons/              ← PWA icons (192px, 512px, maskable variants)
└── mcp/
    └── cloud-run/      ← Cloud Run MCP server (GCP service management)
```

---

## 📦 TrainTrack Module Map (`app.js`)

The entire application lives inside a single self-executing IIFE to prevent global scope pollution:

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

RailRadar endpoints use `Promise.allSettled` batch requests with a shared `AbortController` timeout (8 s), so a single slow train never blocks the whole board.

### `TrainTrack.Search`
O(n) linear scan across ≤80 stations. Prefix-matches on both `name` and `code` fields, limited to 8 results, debounced at 120 ms. No trie needed at this data scale.

### `TrainTrack.UI`
**RAF Render Queue** — all DOM mutations are pushed to a queue and flushed in a single `requestAnimationFrame` callback:

```js
function enqueue(fn) {
  _renderQueue.push(fn);
  if (!_rafId) _rafId = requestAnimationFrame(_flush);
}
```

Live hydration (`hydrateBoard`) is a **micro-update** — it only touches `.train-status-badge`, `.train-platform`, and `.train-eta-value` per card. **No `innerHTML`, no list re-render, no reflow.**

### `TrainTrack.Scheduler`
Wraps `setInterval` with Page Visibility API awareness:
- Pauses the 30 s interval when the tab is hidden (saves mobile battery)
- Fires an immediate refresh when the tab regains focus
- Fully replaceable — call `Scheduler.setEnabled(false)` to respect the user's auto-refresh toggle

### `TrainTrack.App`
Bootstrap sequence:
1. **Instant paint** — serve IndexedDB-cached `schedules.json` if available
2. **Background fetch** — re-fetch `schedules.json` from the network, update IDB
3. **Event binding** — wire all interactions (tabs, autocomplete, swap, nav, drawer)
4. **Live hydration** — after 2 s delay, fetch RailRadar data; repeat every 30 s
5. **Background Sync** — register `sync-schedules` tag with the Service Worker

---

## ⚙️ Service Worker (`sw.js`)

Four caching strategies mapped to URL patterns:

| URL Pattern | Strategy | Rationale |
|-------------|----------|-----------|
| App shell assets (`/`, `index.html`, `styles.css`, `app.js`) | **Cache-first** | Never changes between deployments |
| `schedules.json` | **Stale-while-revalidate** | Serve instantly, update in background |
| `railradar.in/api/*` | **Network-first + cache fallback** | Fresh data preferred; stale on failure |
| Everything else | **Network-first + cache fallback** | General safe default |

**Background Sync** (`sync-schedules` tag): If the app goes offline mid-session, the SW queues a `schedules.json` refresh. When the connection restores — even if the app is closed — the SW fetches the latest schedule silently.

**Push Notifications**: The SW handles `push` events and `notificationclick` to surface train delay alerts (requires `Notification.requestPermission()` from the user).

---

## 🎨 Design System: "Kinetic Nocturne"

Designed in [Stitch MCP](https://stitch.withgoogle.com), project `4943919853862806818`.

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
// app.js → Config
RAILRADAR_BASE: 'https://your-api-proxy.example.com/api',
```

---

## 🗺 Data: `schedules.json`

Static seed dataset with **17 trains** across all 3 lines (76 stations):

| Line | Trains | Stations |
|------|--------|---------|
| Western | 6 (Virar Fast, Borivali Fast, Vasai Fast, Churchgate Slow, Virar AC, Dahisar Fast) | 26 |
| Central | 6 (Kasara Express, Khopoli Local, Thane Fast, Kalyan Slow, Dombivli Fast, Ghatkopar Fast) | 27 |
| Harbour | 5 (Panvel Fast, Vashi Shuttle, Belapur Local, Chembur Slow, Nerul Express) | 16 |

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
