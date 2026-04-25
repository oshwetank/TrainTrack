# TrainTrack v1.5.0 — Live Test & UI Audit Report

**Repository:** https://github.com/oshwetank/TrainTrack
**Live URL:** https://oshwetank.github.io/TrainTrack/
**Version:** v1.5.0
**Audit Date:** Sunday, 26 April 2026, 1:00 AM IST | Mumbai, MH, IN
**Design Spec:** Transit Flow Stitch v1.4.2/v1.5.0
**Branch:** main (cc0cb26) + fix/design-tokens-v1.5.0

---

## PART 1 — LIVE TEST REPORT

### 1.1 Test Environment

| Parameter | Value |
|-----------|-------|
| Browser | Google Chrome (Desktop, ~912px viewport) |
| Network | Live, Mumbai IST |
| Time | 1:00 AM IST (low-service midnight window) |
| Service Worker | Registered — Scope: /TrainTrack/ — Cache Version: traintrack-v1.5.0 |
| PWA | Installable (manifest.json valid, icons present: 192px, 512px, maskable) |

---

### 1.2 Home Screen — Live Test Results

| # | Test | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | Page loads | App shell renders | Renders with hero card and bottom nav | PASS |
| 2 | Hero card | Shows next train info | Empty — no train data loaded | FAIL |
| 3 | Train list | Populated train schedule | Empty list — no trains shown | FAIL |
| 4 | Line tabs (Western/Central/Harbour/Trans-Harbour/Metro) | Filter trains by line | No visible filter change, tabs non-functional | FAIL |
| 5 | Search button | Opens search panel | Button clipped/cut off, click unresponsive | FAIL |
| 6 | Alerts tab | Opens alerts view | View does not visibly switch | FAIL |
| 7 | Settings tab | Opens settings panel | View does not visibly switch | FAIL |
| 8 | Bottom nav layout | Full-width, icons + labels | Bottom nav overflows/clips on ~912px viewport | FAIL |
| 9 | PWA install prompt | Installable banner or button | Manifest valid, installable | PASS |
| 10 | Service Worker | Registered and caching assets | Registered, cache version traintrack-v1.5.0 | PASS |

**Live Test Summary:** 3 PASS / 7 FAIL

---

### 1.3 Live Test — Detailed Findings

#### Finding LT-01: Hero Card Empty
- **Severity:** High
- **Description:** The hero card on the home screen shows no train data. Expected to display the next upcoming train for the selected line.
- **Root Cause:** `journeyTracker.js` fetches live data but the API call to the proxy worker likely fails at midnight (low-service window) or the API response is not being parsed correctly.
- **Impact:** Core feature non-functional for users.

#### Finding LT-02: Train List Empty
- **Severity:** High
- **Description:** The main train schedule list is completely empty. No trains displayed regardless of line selected.
- **Root Cause:** Data fetch failure in `app.js` or `dataUtils.js`. The catch block in `app.js` has a suspected syntax/scope issue that may silently swallow errors.
- **Impact:** Primary use case of the app is broken.

#### Finding LT-03: Line Tabs Non-Functional
- **Severity:** High
- **Description:** Tapping Western / Central / Harbour / Trans-Harbour / Metro line tabs does not update the train list or persist selection.
- **Root Cause:** Line selection state is not persisted across re-renders. The tab click handler may not be triggering a data reload.
- **Impact:** Users cannot switch between Mumbai Local lines.

#### Finding LT-04: Search Button Clipped
- **Severity:** High
- **Description:** The search button in the header is visually clipped (partially hidden) at ~912px viewport and does not respond to clicks.
- **Root Cause:** Header CSS overflow issue. `header` or `.header-actions` container has overflow hidden cutting off the search icon button.
- **Impact:** Search feature completely inaccessible.

#### Finding LT-05: Alerts View Not Switching
- **Severity:** Medium
- **Description:** Tapping the Alerts tab in the bottom nav does not visibly switch the view away from the home screen.
- **Root Cause:** View routing logic in `app.js` may not be correctly toggling the active view class or the alerts view container is hidden with display:none and not being toggled.
- **Impact:** Users cannot access service alerts.

#### Finding LT-06: Settings View Not Switching
- **Severity:** Medium
- **Description:** Tapping the Settings tab does not open the settings panel.
- **Root Cause:** Same view routing issue as LT-05. `settingsView.js` component may not be mounting properly.
- **Impact:** Users cannot change preferences.

#### Finding LT-07: Bottom Nav Layout Overflow
- **Severity:** Medium
- **Description:** The bottom navigation bar overflows its container at the tested viewport width (~912px), causing clipping of nav items.
- **Root Cause:** Bottom nav flex/grid layout uses fixed pixel widths or does not use `flex-wrap: nowrap` correctly with responsive design.
- **Impact:** Degraded visual experience and possibly inaccessible nav items.

---

## PART 2 — UI AUDIT REPORT

### 2.1 Design System Compliance

| Component | Expected (Stitch v1.4.2) | Actual | Status |
|-----------|--------------------------|--------|--------|
| Primary color | #6750A4 (Material You Purple) | Defined in design-system.css | PASS |
| Font | Inter / system-ui | Applied via CSS | PASS |
| Border radius tokens | --radius-sm/md/lg | Partially applied | PARTIAL |
| Elevation / shadow tokens | --elevation-1/2/3 | Some components missing elevation | PARTIAL |
| Spacing tokens | --space-xs through --space-xl | Applied in layout | PASS |
| Dark mode support | CSS prefers-color-scheme | Defined in design-system.css | PASS |
| Icon set | Material Symbols / SVG | Mixed usage, some icons missing | PARTIAL |

### 2.2 Component-Level UI Issues

#### UI-01: Header Component
- **File:** `index.html`, `styles.css`
- **Issue:** Search icon button is clipped by header container overflow. The `.header-actions` div does not have enough right padding to accommodate all action buttons at all viewport widths.
- **Fix:** Add `overflow: visible` to header, or increase `.header-actions` `min-width`. Ensure `padding-right` accounts for all icon buttons.

#### UI-02: Bottom Navigation Bar
- **File:** `js/components/bottomNav.js`, `components.css`
- **Issue:** Nav bar overflows horizontally on ~912px viewport. Five navigation items do not fit within the container without overflow.
- **Fix:** Use `display: grid; grid-template-columns: repeat(5, 1fr)` for the nav bar to ensure equal distribution. Remove any fixed pixel widths on nav items.

#### UI-03: Hero Train Card
- **File:** `js/components/trainCard.js`
- **Issue:** Card renders empty shell with no data. No loading state or empty state placeholder shown to the user.
- **Fix:** Add a loading skeleton or "No trains available" empty state message with retry option.

#### UI-04: Line Tab Selector
- **File:** `js/components/bottomNav.js` or `home.css`
- **Issue:** Selected line tab does not visually persist the active state (no active class applied).
- **Fix:** Apply `.active` class to selected line tab on click and ensure it persists through re-renders via state management.

#### UI-05: Search Panel
- **File:** `js/components/searchUI.js`, `styles.css`
- **Issue:** Search panel does not open when search button is tapped. Panel may exist in DOM but is not toggled to visible state.
- **Fix:** Verify `searchUI.js` event listener is attached after DOM ready. Ensure panel toggle correctly sets `display: block` or removes `hidden` class.

#### UI-06: Alerts View
- **File:** `js/components/alertsView.js`
- **Issue:** Alerts view component does not render or switch to when Alerts nav item is tapped.
- **Fix:** Check view routing in `app.js`. Ensure `alertsView` is correctly instantiated and the `show()` method is called on nav click.

#### UI-07: Settings View
- **File:** `js/components/settingsView.js`
- **Issue:** Settings view does not render or switch to when Settings nav item is tapped.
- **Fix:** Same as UI-06. Verify `settingsView` component is mounted and wired to nav routing.

#### UI-08: Missing search.css in Service Worker Cache
- **File:** `sw.js`
- **Issue:** `search.css` is referenced in the app but missing from the Service Worker pre-cache list.
- **Fix:** Add `search.css` to the `ASSETS_TO_CACHE` array in `sw.js`.

---

## PART 3 — CODE AUDIT SUMMARY

### 3.1 Critical Code Issues

| ID | File | Issue | Severity |
|----|------|-------|----------|
| C-01 | `js/app.js` | Catch block syntax/scope issue may silently swallow fetch errors | High |
| C-02 | `sw.js` | `search.css` missing from pre-cache asset list | Medium |
| C-03 | `js/components/bottomNav.js` | Line tab click handler does not persist active state | High |
| C-04 | `js/app.js` | View routing logic does not correctly toggle Alerts/Settings views | High |
| C-05 | `js/components/searchUI.js` | Search panel toggle not wired correctly to button click | High |
| C-06 | `proxy/worker.js` | No rate limiting or error response standardization for API proxy | Medium |
| C-07 | `js/utils/dataUtils.js` | No fallback/cached data returned on API failure | High |

### 3.2 What is Working

- PWA manifest is valid and complete (icons, theme color, display mode)
- Service Worker registers successfully and caches assets
- CSS design system tokens are defined and partially applied
- Dark mode CSS is defined via `prefers-color-scheme`
- App shell HTML structure is correct
- GitHub Actions deployment to Pages is working
- Cloudflare Workers proxy for API is deployed

---

## PART 4 — PRIORITY FIX LIST

| Priority | ID | Fix | Files Affected |
|----------|----|-----|----------------|
| P0 | C-01 | Fix catch block in app.js to log and handle fetch errors | `js/app.js` |
| P0 | C-07 | Add fallback cached data when API fails | `js/utils/dataUtils.js` |
| P0 | C-03 | Fix line tab active state persistence | `js/components/bottomNav.js` |
| P0 | C-04 | Fix view routing for Alerts and Settings | `js/app.js` |
| P0 | C-05 | Fix search panel toggle | `js/components/searchUI.js` |
| P1 | UI-01 | Fix header search button clipping | `styles.css`, `index.html` |
| P1 | UI-02 | Fix bottom nav overflow layout | `components.css`, `js/components/bottomNav.js` |
| P1 | UI-03 | Add loading/empty state to hero card | `js/components/trainCard.js` |
| P2 | C-02 | Add search.css to SW cache list | `sw.js` |
| P2 | C-06 | Standardize proxy error responses | `proxy/worker.js` |

---

## PART 5 — OVERALL VERDICT

| Area | Score | Notes |
|------|-------|-------|
| PWA / Infrastructure | 9/10 | Strong setup, SW + manifest working |
| Code Quality | 5/10 | Several critical logic bugs |
| Live Functionality | 3/10 | Most core features broken at test time |
| UI / Design Compliance | 6/10 | Design system defined, components have layout issues |
| **Overall** | **5.75/10** | **Needs critical fixes before production use** |

> **Recommendation:** Address all P0 items before next release. The app infrastructure (PWA, deployment, proxy) is solid but core functionality (data loading, view routing, search) must be repaired.

---

*Report generated by automated live test and code audit — TrainTrack v1.5.0 — 26 April 2026, 1:00 AM IST*
