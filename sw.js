/**
 * TrainTrack — sw.js (Service Worker)
 * Mumbai Local Train Tracker · Phase 2: The Water
 *
 * Strategy:
 *   Static app shell → Cache-first (always serve from cache)
 *   schedules.json   → Cache-first with background network update
 *   RailRadar API    → Network-first, fall back to cache on error
 *   Everything else  → Network-first with stale fallback
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `traintrack-static-${CACHE_VERSION}`;
const DATA_CACHE    = `traintrack-data-${CACHE_VERSION}`;
const ALL_CACHES    = [STATIC_CACHE, DATA_CACHE];

/* Files that form the app shell — must ALL be cached at install time */
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/schedules.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const RAILRADAR_ORIGIN = 'https://railradar.in';

/* ── Install: pre-cache app shell ────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Pre-caching app shell…');
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting())    /* activate immediately */
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
    ).then(() => self.clients.claim())  /* take control of existing clients */
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

  /* 3. schedules.json → Stale-while-revalidate
        Serve cached instantly, refresh in background */
  if (url.pathname === '/schedules.json') {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  /* 4. App shell assets → Cache-first */
  if (SHELL_ASSETS.some(asset => url.pathname === asset || url.pathname === '/')) {
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
    const response = await fetch(request, { signal: AbortSignal.timeout(8000) });
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
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  /* Serve stale immediately if available; otherwise wait for network */
  return cached ?? (await networkPromise) ?? Response.error();
}

/* ── Background Sync (when connection restores) ──────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-schedules') {
    event.waitUntil(
      fetch('/schedules.json')
        .then(async res => {
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put('/schedules.json', res);
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
  const icon   = data.icon   ?? '/icons/icon-192.png';
  const badge  = data.badge  ?? '/icons/icon-192.png';
  const tag    = data.tag    ?? 'traintrack-notif';

  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge, tag,
      data: data.url ?? '/',
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
  const url = event.notification.data ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const existing = clientList.find(c => c.url === url && 'focus' in c);
        return existing ? existing.focus() : clients.openWindow(url);
      })
  );
});
