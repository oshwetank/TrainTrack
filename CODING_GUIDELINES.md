# TrainTrack Coding Guidelines & Architectural Blueprint

## 1. Core Principles
- **Compute-Efficiency First**: Minimize JS execution, leverage CSS for animations, and use service workers for intelligent caching.
- **Privacy by Design**: No tracking, local-first storage for user preferences.
- **Resilience**: Offline-first functionality (PWA) with graceful degradation for RailRadar API calls.

## 2. Technical Stack
- **Frontend**: Vanilla JS or Lightweight Preact, Tailwind CSS (via CDN or JIT), HTML5.
- **Backend/API**: RailRadar API (Integration via Sitch MCP).
- **Automation**: Sitch MCP for GitHub-based coding and deployment triggers.

## 3. Architecture Layer
- **Client Side**: State management using browser LocalStorage/IndexedDB.
- **Service Worker**: Handle background sync for train schedules and push notifications for delays.
- **Sitch MCP**: The "Brain" for automation - handles code generation, PR reviews, and deployment pipelines directly on GitHub.

## 4. Prompt for TrainTrack Coding (Walk in the Garden)

> "Act as the lead architect for TrainTrack. I have connected Sitch MCP and RailRadar API. Your task is to develop the app logic on GitHub.
>
> **The Garden Path Workflow:**
> 1. **Seed**: Look at the current UI components in `index.html`.
> 2. **Water**: Write modular, clean JS in `app.js` to fetch real-time train data from RailRadar. Use Sitch MCP to bridge any complex logic.
> 3. **Prune**: Optimize for low compute. Avoid heavy loops or unnecessary re-renders. Use CSS variables for theme switching.
> 4. **Bloom**: Ensure PWA manifest and service workers are correctly implemented for offline tracking.
>
> **Reference Context**: Always refer to the RailRadar API documentation for endpoint structures. Ensure all commits follow conventional commit messages."
