# TrainTrack Coding Guidelines & Architectural Blueprint

## 1. Core Principles
- **Compute-Efficiency First**: Minimize JS execution (zero-framework), leverage GPU-accelerated CSS, and use Service Workers for intelligent caching.
- **Privacy by Design**: Zero tracking, local-first storage (IndexedDB/LocalStorage).
- **Resilience**: Offline-first (PWA) with graceful degradation for RailRadar API calls.
- **Walk in the Garden**: Phased development approach for extreme maintainability.

## 2. Technical Stack
- **Frontend**: ES6+ Vanilla JS, Tailwind CSS (JIT via CDN), Semantic HTML5.
- **API Layer**: RailRadar API (Live tracking, schedules, delays).
- **Automation/Agents**: 
    - **Stitch MCP**: Orchestrates Google Stitch designs into code blueprints.
    - **Antigravity**: Agent-first IDE for autonomous coding and verification.
    - **GitHub Actions**: Continuous deployment to GitHub Pages.

## 3. Detailed Architectural Blueprint (Garden Path)

### 🌱 Phase 1: Seed (The Shell)
- **Architectural Goal**: Zero-Logic UI Stability & Theme Shell.
- **Logic**: Establish `index.html` structure. CSS variables for Mumbai Local line colors (Western: Red, Central: Maroon, Harbour: Blue).
- **Compute Constraint**: 0ms JS execution during initial paint.
- **Code Reference**: Use semantic `<header>`, `<main>`, and `<section>` for accessibility.

### 💧 Phase 2: Water (The Logic)
- **Architectural Goal**: Asynchronous Data Hydration & API Resilience.
- **Logic**: Modular JS in `app.js`. Use `AbortController` for 8s timeouts.
- **Integration**:
    - Fetch real-time data from RailRadar.
    - Bridge with Stitch MCP to map design tokens to live DOM elements.
    - Implement a lightweight `TrainTrack.Store` for state management.

### ✂️ Phase 3: Prune (Optimization)
- **Architectural Goal**: Compute Minimization & Battery Saving.
- **Logic**: 
    - `requestAnimationFrame` for all DOM updates to avoid layout thrashing.
    - `Page Visibility API`: Halt API polling when the app is backgrounded.
    - CSS-only transitions (transform/opacity) to keep CPU usage < 2%.
- **Constraint**: No heavy loops; use `Map` or `Set` for schedule lookups.

### 🌸 Phase 4: Bloom (Resilience)
- **Architectural Goal**: Offline Tracking & Production Reliability.
- **Logic**:
    - Service Worker (`sw.js`) handles Stale-While-Revalidate for schedules.
    - `manifest.json` for standalone PWA experience.
    - IndexedDB for large local schedule storage.

## 4. Antigravity + Stitch MCP Prompt (System Orchestrator)

> **Role**: Lead Software Architect & Agent Manager for TrainTrack.
> **Context**: You are connected to **Stitch MCP** (Google's Design-to-Code layer) and **RailRadar API**. 
> **Mission**: Build the Mumbai Local Train Tracker app using the "Walk in the Garden" methodology. 
>
> **Instructions**:
> 1. **Compute Efficiency**: Minimize JS execution. Use Antigravity to plan tasks then execute them in minimal, clean commits on GitHub.
> 2. **Stitch Integration**: Pull UI blueprints from Stitch MCP. Translate these designs into semantic HTML/Tailwind. Do NOT add heavy JS frameworks.
> 3. **GitHub-First**: All coding, testing, and documentation updates must happen directly in the GitHub repository.
> 4. **API Strategy**: Interface with RailRadar for real-time train data. Implement robust error handling and offline state using IndexedDB.
> 5. **Execution**: Start by reading `CODING_GUIDELINES.md` and `index.html`. Follow the Garden Path (Seed → Water → Prune → Bloom).
> **Constraint**: Ensure the final PWA score is 100 on Lighthouse for Performance and PWA.

## 5. Code Efficiency Benchmarks
- **Initial Load**: < 50KB (Gzipped).
- **Main Thread Execution**: < 20ms during data updates.
- **Battery Impact**: "Low" classification in mobile browsers.
