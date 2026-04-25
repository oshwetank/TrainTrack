/**
 * TrainTrack — sw.js (Service Worker)
 * Mumbai Local Train Tracker · Phase 2: The Water
 *
 * Strategy:
 *   Static app shell → Cache-first (always serve from cache)
 *   schedules.json   → Cache-first with background network update
 *   RailRadar API    → Network-first, fall back to cache on error
 *   Everything else  → Network-first with stale fallback
 *
 * GitHub Pages compatibility:
 *   All asset paths use './' (relative to SW location) so the service worker
 *   resolves the correct absolute URLs regardless of the hosting base path
 *   (root domain or /TrainTrack/ on GitHub Pages). Fetch routing uses
 *   self.registration.scope to normalise pathnames at runtime.
 */

const CACHE_VERSION = 'traintrack-v1.5.2';
const STATIC_CACHE  = `traintrack-static-${CACHE_VERSION}`;
const DATA_CACHE    = `traintrack-data-${CACHE_VERSION}`;
const ALL_CACHES    = [STATIC_CACHE, DATA_CACHE];

/* Relative shell asset paths — resolved against SW URL at install time.
   Works at '/' (custom domain) AND at '/TrainTrack/' (GitHub Pages).   */
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './schedules.json',
  './disruptions.json',

  // CSS
  './css/styles.css',
  './css/design-system.css',
  './css/components.css',
  './css/home.css',
  './css/journey-tracker.css',
  './css/search.css',
  './css/legacy.css',
  './css/alerts.css',

  // JS (ES module tree)
  './js/app.js',
  './js/components/trainCard.js',
  './js/components/journeyTracker.js',
  './js/components/bottomNav.js',
  './js/components/alertsView.js',
  './js/components/settingsView.js',
  './js/components/searchUI.js',
  './js/utils/timeUtils.js',
  './js/utils/dataUtils.js',
];

/* Fonts cached best-effort — failure here must NOT block SW install */
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Be+Vietnam+Pro:wght@400;500;600&display=swap',
];

const RAILRADAR_ORIGIN = 'https://traintrack-proxy.oshwetank.workers.dev';

/* ── Fetch routing note ────────────────────────────────────────────────────
   Order matters: the first matching branch wins.

   1. Non-GET / extension requests  → pass-through (ignored)
   2. RailRadar API                 → Network-first  (live data, data cache)
   3. schedules.json                → Stale-while-revalidate (instant + refresh)
   4. App shell assets              → Cache-first    (offline-first shell)
   5. Everything else               → Network-first with stale fallback

   GitHub Pages note: request URLs include the repo base path
   (e.g. /TrainTrack/css/styles.css). We resolve SHELL_ASSETS to their full
   absolute URLs at install time and store them in _shellSet for O(1) lookup.
   ───────────────────────────────────────────────────────────────────────── */

/* AbortSignal.timeout polyfill for older browsers */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/* Resolved absolute URLs of shell assets — populated during install. */
let _shellSet  = null;
let _scheduleUrl = null;

function _buildShellSet() {
  const scope = self.registration.scope; // e.g. "https://host/TrainTrack/"
  _shellSet = new Set();
  _scheduleUrl = new URL('./schedules.json', scope).href;

  SHELL_ASSETS.forEach(asset => {
    try {
      // Absolute URLs (e.g. fonts.googleapis.com) pass through unchanged
      const url = asset.startsWith('http') ? asset : new URL(asset, scope).href;
      _shellSet.add(url);
    } catch (_) { /* skip malformed */ }
  });
}

/* ── Install: pre-cache app shell ────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      console.log('[SW] Pre-caching app shell…');
      _buildShellSet();
      await cache.addAll(SHELL_ASSETS);
      /* Fonts: best-effort — network blocks (corporate proxies, etc.) must not break install */
      await Promise.allSettled(FONT_URLS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean up old caches ──────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !ALL_CACHES.includes(k))
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => {
      _buildShellSet(); // Ensure set is ready after activate
      return self.clients.claim();
    })
  );
});

/* ── Fetch: routing strategy ─────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* 1. Skip non-GET and browser-extension requests */
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  /* 2. RailRadar API → Network-first with data-cache fallback */
  if (url.origin === RAILRADAR_ORIGIN) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  /* Ensure _shellSet is populated (may be null if SW was already active) */
  if (!_shellSet) _buildShellSet();

  /* 3. schedules.json → Stale-while-revalidate
        Serve cached instantly, refresh in background */
  if (request.url === _scheduleUrl) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  /* 4. App shell assets → Cache-first */
  if (_shellSet.has(request.url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* 5. Everything else → Network-first with stale fallback */
  event.respondWith(networkFirstWithCache(request, STATIC_CACHE));
});

/* ── Strategies ──────────────────────────────────────────────────────────── */

/* Cache-first: return from cache, only hit network if not cached */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/* Network-first: try network, fall back to cache on failure */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { signal: timeoutSignal(8000) });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (_err) {
    const cached = await cache.match(request);
    return cached ?? Response.error();
  }
}

/* Stale-while-revalidate: return cached immediately, update cache in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  /* Kick off network request in background regardless */
  const networkPromise = fetch(request, { signal: timeoutSignal(8000) }).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  /* Serve stale immediately if available; otherwise wait for network */
  return cached ?? (await networkPromise) ?? Response.error();
}

/* ── Background Sync (when connection restores) ──────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-schedules') {
    const scheduleUrl = new URL('./schedules.json', self.registration.scope).href;
    event.waitUntil(
      fetch(scheduleUrl)
        .then(async res => {
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(scheduleUrl, res);
            console.log('[SW] schedules.json refreshed via background sync');
          }
        })
        .catch(e => console.warn('[SW] Background sync failed:', e))
    );
  }
});

/* ── Push Notifications (optional — requires permission) ─────────────────── */
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title  = data.title  ?? 'TrainTrack';
  const body   = data.body   ?? 'Train status update';
  const icon   = data.icon   ?? './icons/icon-192.png';
  const badge  = data.badge  ?? './icons/icon-192.png';
  const tag    = data.tag    ?? 'traintrack-notif';

  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge, tag,
      data: data.url ?? './',
      actions: [
        { action: 'view', title: '🚆 View Trains' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data ?? './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const existing = clientList.find(c => c.url === url && 'focus' in c);
        return existing ? existing.focus() : clients.openWindow(url);
      })
  );
});
