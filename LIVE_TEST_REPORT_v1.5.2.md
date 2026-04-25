# TrainTrack v1.5.2 — Live Test Report

**Test Date:** Sunday, 26 April 2026, 3:00 AM IST
**Location:** Mumbai, Maharashtra, IN
**Test Environment:** Chrome Desktop (~912px viewport)
**Live URL:** https://oshwetank.github.io/TrainTrack/
**Method:** Hard refresh (Ctrl+Shift+R) + full manual UI interaction test

---

## Executive Summary

TrainTrack v1.5.2 was deployed and tested live. The council-approved bug fixes and UI improvements show **mixed results**. Core navigation and line-tab functionality have improved significantly, but critical UI/UX issues remain that prevent the app from being production-ready.

**Overall Score: 6.5/10** (up from 4/10 in v1.5.0)

**Status: PARTIALLY WORKING** — needs 3-4 critical fixes before full release.

---

## Test Results Summary

### What's Working ✅

| Feature | Status | Notes |
|---------|--------|-------|
| App shell loads | ✅ PASS | Warm off-white background renders correctly |
| Line tab switching | ✅ PASS | Western → Central → Harbour → Trans-Harbour → Metro 1/2A/7 all switch active state visually |
| Line colour coding | ✅ PASS | Western orange, Central red, Harbour blue, Trans-Harbour green, Metro teal/purple/yellow |
| Alerts view | ✅ PASS | Opens, loads disruption data, shows 5 real alerts with severity badges |
| Settings view | ✅ PASS | Opens, renders all controls (24-hr clock, dark mode, walk time, auto-refresh, version info) |
| Search panel | ✅ PASS | Opens full-screen, autocomplete works, shows results with line colour dots |
| Recent searches | ✅ PASS | Empty input shows greyed recent stations, no section header (exactly as council specified) |
| Bottom nav | ✅ PASS | Home/Alerts/Settings all clickable, active state highlights correctly |
| Alert card styling | ✅ PASS | Left coloured border stripe by severity (red/orange/green) |
| Settings toggles | ✅ PASS | 24-hr clock ON, Dark mode OFF, Auto-refresh ON |
| Empty state message | ✅ PASS | "No trains in the next 2 hours" shown in hero card at 3 AM (correct) |
| PWA Service Worker | ✅ PASS | Registered, cache active |

### What's Broken or Partially Working ⚠️

| Issue | Severity | Description |
|-------|----------|-------------|
| View routing layout | 🔴 CRITICAL | Alerts and Settings views APPEND below home content instead of REPLACING it. Home content stays visible when switching views. |
| Empty state line reference | 🟡 MEDIUM | Train list empty message says "No upcoming trains on the **western** line" even when Central/Harbour/Metro tab is selected. |
| Header button overlap | 🟡 MEDIUM | "Search" and "Settings" text run together as "SeaSettings" at 912px viewport. |
| Header Settings button | 🟡 MEDIUM | Top-right "Settings" button does nothing (only bottom nav Settings works). |
| Hero card new design | 🔴 CRITICAL | No conic-gradient countdown ring, no two-column layout — still shows plain orange block with text only. |
| Train cards | ⏳ UNTESTABLE | No trains at 3 AM — cannot verify line stripe, countdown pill, press feedback. |
| Saved journeys | ⏳ UNTESTABLE | No saved journeys exist — cannot verify swap button or line dot. |

---

## Detailed Test Findings

### 1. Hero Card

**Visual:** Large orange/amber rounded rectangle with centered text "No trains in the next 2 hours."

**Expected (v1.5.2 design):** Two-column layout — left side with route (FROM → TO), type badge, platform; right side with 88px conic-gradient countdown ring showing progress as train approaches.

**Actual:** Old template still in use. No countdown ring, no split layout, no visual progress indicator.

**Data Accuracy:** Message is correct for 3 AM — no Mumbai Local trains run until ~5 AM first service.

**Verdict:** Design not implemented in live deployment.

---

### 2. Line Tabs

**Test sequence:**
- Default: Western (orange pill active)
- Click Central → Central turns red, Western deselects ✅
- Click Harbour → Harbour turns blue, Central deselects ✅
- Click Trans-Harbour → Trans-Harbour turns green ✅
- Click Metro 1 → Metro 1 turns teal ✅

**Active state persistence:** Working correctly.

**Bug:** Train list empty state message remains "No upcoming trains on the **western** line" regardless of which tab is selected. The empty state text does not update to reflect the active line.

**Verdict:** Visual tab switching works, but data/text updates are incomplete.

---

### 3. Bottom Navigation

**Home tab:**
- Click Home → scrolls to top, shows home content ✅
- Active indicator (orange colour) applies correctly ✅

**Alerts tab:**
- Click Alerts → Alerts view renders below home content
- Loads 5 disruption cards:
  - Western Line Mega Block (SCHEDULED, High severity, red border)
  - Central Line Mega Block (SCHEDULED, High severity, red border)
  - Signal Failure — Harbour Line (ACTIVE, Medium severity, orange border)
  - Track Maintenance — Virar to Dahanu (SCHEDULED, Low severity, green border)
  - Heavy Crowding — Morning Rush (ACTIVE, Low severity, green border)
- Active indicator works ✅

**Settings tab:**
- Click Settings → Settings view renders below home content
- Sections visible:
  - DISPLAY: 24-hour clock (ON), Dark mode (OFF)
  - JOURNEY: Walk time to station (10 min), Auto-refresh live data (ON, 60s)
  - ABOUT: Version v1.5.0, Data source (RailRadar + Static schedules), Coverage (Mumbai Local + Metro)
- Active indicator works ✅

**Critical Layout Issue:** Both Alerts and Settings views do NOT replace the home view — they append below it. User must scroll down past "Saved Journeys" and "Next Trains" sections to see Alerts/Settings content. This breaks the single-view routing pattern.

**Verdict:** Views load correctly but layout/DOM structure is wrong.

---

### 4. Search

**Open behavior:** Full-screen overlay with input field and placeholder "Search station (e.g., Andheri)". ✅

**Autocomplete test:**
- Typed "Andheri"
- Results shown:
  - Andheri — Western Line (W orange dot)
  - Andheri (H) — Harbour Line (H purple dot)
  - Andheri (Harbour) — Harbour Line
  - Andheri — Metro-Aqua Line (teal dot)
  - Andheri (W) — Metro-Red Line (red dot)
  - Andheri (E) — Metro-Yellow Line (yellow dot)
- All 6 results displayed correctly with line colour dots ✅

**Recent searches test:**
- Selected "Andheri / Western Line"
- Closed search, reopened
- Cleared input field
- Recent search shown: "Andheri / Western Line" with W orange dot, greyed text, no section header ✅

**Close behavior:** "Back" button closes search and returns to home view ✅

**Verdict:** Search works perfectly, council spec fully implemented.

---

### 5. Train List & Empty State

**Context:** At 3 AM IST, Mumbai Local trains do not run (first service ~5 AM).

**Hero card:** Shows "No trains in the next 2 hours." ✅

**Train list section:**
- Heading: "Next Trains"
- Icon: Train emoji with station marker
- Text: "No upcoming trains on the western line."
- Subtext: "Try a different line or check back soon."

**Bug:** When Central/Harbour/Trans-Harbour/Metro tab is selected, the message still says "**western** line" instead of updating to "central line", "harbour line", etc.

**Expected:** Message should dynamically update to "No upcoming trains on the **[selected line]** line."

**Verdict:** Empty state renders but text is stale.

---

### 6. Saved Journeys

**Display:** Section heading "Saved Journeys" with instruction text "Tap the bookmark on a train to save a journey."

**Content:** No saved journeys exist in localStorage.

**Cannot test:** Swap button (⇄), line colour dot on journey chips.

**Verdict:** Untestable at 3 AM without train data.

---

### 7. Header Layout

**Visible elements (left to right):**
- "Good morning, Traveler" (greeting)
- "Sear" (truncated "Search" button text)
- "Settings" (Settings button text)

**Overlap issue:** "Sear" and "Settings" visually collide at 912px viewport, rendering as "SeaSettings" with no visible gap or separator.

**Root cause:** Insufficient `gap` or `margin` in `.header-actions` flex container.

**Header Settings button:** Clicking the top-right "Settings" text does nothing. Only the bottom nav "Settings" tab works.

**Verdict:** Header layout needs CSS spacing fix. Header Settings button is non-functional.

---

### 8. Council Specification Compliance

**From the council review, what was supposed to be implemented:**

| Item | Implemented? | Notes |
|------|--------------|-------|
| Fix 60s DOM re-render | Unknown | Cannot verify — requires monitoring over time |
| Page Visibility API pause | Unknown | Cannot verify without DevTools |
| Hero card conic-gradient ring | ❌ NO | Old template still in use |
| Train card line stripe | ⏳ UNTESTABLE | No trains to render |
| Train card countdown pill | ⏳ UNTESTABLE | No trains to render |
| Swap button on saved journeys | ⏳ UNTESTABLE | No saved journeys |
| Line colour dot on journey chips | ⏳ UNTESTABLE | No saved journeys |
| :active press feedback | ⏳ UNTESTABLE | No train cards to tap |
| Recent searches (greyed, no header) | ✅ YES | Works perfectly |
| Pill-shaped tabs with scroll gradient | ✅ YES | Tabs are pill-shaped, scroll may apply if more lines added |
| Font preload links | Unknown | Cannot verify without DevTools Network panel |
| Disruptions timestamp (no illustration) | ⚠️ PARTIAL | No timestamp shown, no "All clear" illustration (empty alerts list not tested) |

**Compliance Score:** 2/12 confirmed implemented, 7/12 untestable, 3/12 missing.

---

## Priority Fix List

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| **P0** | Fix view routing — Alerts/Settings should HIDE home content, not append below it | Users cannot access views without scrolling, confusing UX | Medium |
| **P0** | Implement hero card conic-gradient countdown ring and two-column layout | Core visual improvement missing | High |
| **P1** | Update empty state message to use selected line name dynamically | Confusing message when non-Western line selected | Low |
| **P1** | Fix header "Search"/"Settings" button overlap at 912px viewport | Unreadable header text | Low |
| **P1** | Wire header "Settings" button or remove it | Non-functional UI element | Low |
| **P2** | Re-test train cards, saved journeys during daytime (5 AM - 11 PM) | Cannot verify line stripe, countdown pill, swap button at 3 AM | N/A (time-dependent) |

---

## Recommendations

1. **Fix view routing immediately.** The append-below behavior breaks the single-view SPA pattern and creates scroll confusion.

2. **Implement hero card ring.** This was the #1 council-approved visual improvement and is completely missing from live deployment.

3. **Dynamic empty state.** Low-effort fix with high clarity improvement.

4. **Daytime re-test required.** Schedule a full live test between 6 AM - 10 PM to verify train card rendering, line stripes, countdown pills, and saved journey features.

---

**Report compiled:** 26 April 2026, 3:30 AM IST
**Tester:** Comet (automated browser agent)
**Next test:** Schedule for daytime window (post-5 AM first service)
