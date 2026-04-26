import { createTrainCard } from './components/trainCard.js';
import { initJourneyTracker, updateETA, stopJourneyTracking } from './components/journeyTracker.js';
import { initBottomNav, setActiveViewToHome } from './components/bottomNav.js';
import { initSearch } from './components/searchUI.js';
import { getGreeting, calculateCountdown, calculateETA } from './utils/timeUtils.js';
import { getNextDepartures, escapeHTML, timeoutSignal } from './utils/dataUtils.js';

/**
 * TrainTrack - app.js
 * Mumbai Local Train Tracker · Phase 3: Bloom (PWA Resilience)
 *
 * Architecture: Single TrainTrack namespace, Vanilla JS (zero framework)
 * Strategy:    Stale-While-Revalidate - render schedules.json instantly,
 *              hydrate with RailRadar live data in background.
 *              Background Sync API for schedule refresh on reconnect.
 * Performance: All DOM mutations via requestAnimationFrame
 *              60-second live polling (paused on Page Visibility hidden)
 *              timeoutSignal(8000) on all outbound fetches
 *
 * Modules:
 *   TrainTrack.Config    - constants, API endpoints, cache keys
 *   TrainTrack.Store     - localStorage prefs/favs + IndexedDB schedule cache
 *   TrainTrack.API       - fetch wrapper with in-memory SWR cache
 *   TrainTrack.Search    - O(n) station prefix-match autocomplete
 *   TrainTrack.App       - bootstrap & event orchestration
 */

/* -------------------------------------------------------------------------- */
/* 0. NAMESPACE GUARD */
/* -------------------------------------------------------------------------- */
if (window.TrainTrack) {
  console.warn('[TrainTrack] app.js loaded more than once - skipping re-init.');
}

const TrainTrack = (() => {
  'use strict';

  /* =========================================================================
     1. CONFIG
     ========================================================================= */
  const Config = Object.freeze({
    VERSION: '1.5.3',

    /* Static dataset - served from same origin, always available */
    SCHEDULES_URL:    './schedules.json',
    DISRUPTIONS_URL:  './disruptions.json',

    /* Cloudflare Worker CORS proxy — forwards to railradar.in with API key */
    RAILRADAR_BASE: 'https://traintrack-proxy.oshwetank.workers.dev/proxy',

    /* How long (ms) before a live API response is considered stale */
    CACHE_TTL_MS: 60_000,

    /* Polling interval for live hydration */
    POLL_INTERVAL_MS: 60_000,

    /* localStorage keys */
    LS_LINE:       'tt_line',
    LS_FROM:       'tt_from',
    LS_TO:         'tt_to',
    LS_FAVS:       'tt_favs',
    LS_CLOCK24:    'tt_clock24',
    LS_REFRESH:    'tt_autorefresh',
    LS_DISMISSED:  'tt_dismissed_disruptions',
    WALK_TIME_KEY: 'traintrack_walk_time',
    DEFAULT_WALK_TIME: 10,

    /* IndexedDB */
    IDB_NAME:    'traintrack-db',
    IDB_VERSION: 2,
    IDB_STORE:   'schedule-cache',

    /* All lines (suburban + metro) — used for station indexing */
    LINES: ['western', 'central', 'harbour', 'trans_harbour', 'metro_aqua', 'metro_red', 'metro_yellow'],
    /* Metro Lines (operational 2026) */
    METRO_LINES: [
      { id: 'metro_aqua',   name: 'Metro Line 1 (Aqua)',   color: '#06b6d4' },
      { id: 'metro_red',    name: 'Metro Line 2A (Red)',   color: '#ef4444' },
      { id: 'metro_yellow', name: 'Metro Line 7 (Yellow)', color: '#eab308' },
    ],

    /* Peak hour windows - 24-hour format */
    PEAK_HOURS: Object.freeze({
      morning: { start: 7,  end: 11 },
      evening: { start: 17, end: 22 },
    }),

    /* Mumbai emergency helpline numbers */
    EMERGENCY_NUMBERS: Object.freeze({
      railway_helpline: '18001111392',
      railway_security: '9004494949',
      rpf_emergency:    '182',
      police:           '100',
      ambulance:        '108',
      women_helpline:   '1091',
    }),
  });

  /* =========================================================================
     2. STORE - localStorage & IndexedDB
     ========================================================================= */
  const Store = (() => {
    /* -- 2a. localStorage helpers -- */
    function ls_get(key, fallback = null) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    }
    function ls_set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { console.warn('[Store] localStorage write failed:', e); }
    }

    /* -- 2b. Preferences -- */
    function getPrefs() {
      return {
        line:     ls_get(Config.LS_LINE,    'western'),
        from:     ls_get(Config.LS_FROM,    null),
        to:       ls_get(Config.LS_TO,      null),
        clock24:  ls_get(Config.LS_CLOCK24, true),
        autoref:  ls_get(Config.LS_REFRESH, true),
      };
    }
    function savePrefs(patch) {
      if ('line'    in patch) ls_set(Config.LS_LINE,    patch.line);
      if ('from'    in patch) ls_set(Config.LS_FROM,    patch.from);
      if ('to'      in patch) ls_set(Config.LS_TO,      patch.to);
      if ('clock24' in patch) ls_set(Config.LS_CLOCK24, patch.clock24);
      if ('autoref' in patch) ls_set(Config.LS_REFRESH, patch.autoref);
    }

    /* -- 2c. Favourites -- */
    function getFavourites() { return ls_get(Config.LS_FAVS, []); }
    function addFavourite(from, to, line) {
      const favs = getFavourites();
      const key = `${from}|${to}|${line}`;
      if (favs.some(f => `${f.from}|${f.to}|${f.line}` === key)) return false;
      favs.push({ from, to, line, addedAt: Date.now() });
      ls_set(Config.LS_FAVS, favs);
      return true;
    }
    function removeFavourite(from, to, line) {
      const favs = getFavourites().filter(
        f => !(f.from === from && f.to === to && f.line === line)
      );
      ls_set(Config.LS_FAVS, favs);
    }

    /* -- 2d. IndexedDB - schedule cache -- */
    let _db = null;

    async function openDB() {
      if (_db) return _db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(Config.IDB_NAME, Config.IDB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(Config.IDB_STORE)) {
            db.createObjectStore(Config.IDB_STORE, { keyPath: 'key' });
          }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror   = (e) => { reject(e.target.error); };
      });
    }

    async function idb_put(key, data) {
      try {
        const db = await openDB();
        const tx = db.transaction(Config.IDB_STORE, 'readwrite');
        tx.objectStore(Config.IDB_STORE).put({ key, data, ts: Date.now() });
        return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
      } catch (e) { console.warn('[Store] IDB write failed:', e); }
    }

    async function idb_get(key) {
      try {
        const db = await openDB();
        const tx = db.transaction(Config.IDB_STORE, 'readonly');
        return new Promise((res, rej) => {
          const req = tx.objectStore(Config.IDB_STORE).get(key);
          req.onsuccess = () => res(req.result ?? null);
          req.onerror   = () => rej(req.error);
        });
      } catch (e) { console.warn('[Store] IDB read failed:', e); return null; }
    }

    async function cacheSchedules(data) { await idb_put('schedules', data); }
    async function getCachedSchedules() {
      const row = await idb_get('schedules');
      return row ? row.data : null;
    }

    return { getPrefs, savePrefs, getFavourites, addFavourite, removeFavourite, cacheSchedules, getCachedSchedules };
  })();

  /* =========================================================================
     3. API - Fetch with Stale-While-Revalidate
     ========================================================================= */
  const API = (() => {
    /* In-memory response cache: key → { data, ts } */
    const _cache = new Map();

    /* -- 3a. Core fetch wrapper - JSON only -- */
    async function _fetch(url, opts = {}) {
      const res = await fetch(url, {
        signal: opts.signal ?? timeoutSignal(8000),
        headers: { 'Accept': 'application/json', ...(opts.headers ?? {}) },
        ...opts,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return res.json();
    }

    /* -- 3b. Stale-While-Revalidate wrapper -- */
    async function fetchSWR(key, fetchFn, opts = {}) {
      const cached = _cache.get(key);
      const now = Date.now();
      const fresh = cached && (now - cached.ts < (opts.ttl ?? Config.CACHE_TTL_MS));

      if (fresh) return { data: cached.data, fromCache: true };

      /* If we have stale data, return it immediately and refresh in background */
      if (cached) {
        fetchFn().then(data => {
          _cache.set(key, { data, ts: Date.now() });
          opts.onRevalidate?.(data);
        }).catch(e => console.warn('[API] Background revalidation failed:', e));
        return { data: cached.data, fromCache: true, revalidating: true };
      }

      /* No cache at all - must await */
      const data = await fetchFn();
      _cache.set(key, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    /* -- 3c. Load static schedules.json (always succeeds - local file) -- */
    async function loadSchedules() {
      const key = 'local:schedules';
      return fetchSWR(key, () => _fetch(Config.SCHEDULES_URL), { ttl: Infinity });
    }

    /* -- 3d. RailRadar live station arrivals -----------------------------
       Endpoint: GET /api/station/{stationCode}/arrivals
       Free public endpoint - no key required for basic lookup.
       Returns array of { trainNo, name, eta, delay, platform }
       Falls back silently on network error or CORS block.              -- */
    async function fetchLiveArrivals(stationCode, signal) {
      const key = `live:arrivals:${stationCode}`;
      return fetchSWR(key, async () => {
        const url = `${Config.RAILRADAR_BASE}/station/${stationCode}/arrivals`;
        return _fetch(url, { signal });
      }, { ttl: Config.CACHE_TTL_MS });
    }

    /* -- 3e. RailRadar live train status ---------------------------------
       Endpoint: GET /api/trains/{trainNo}/live
       Returns { trainNo, currentStation, delay, nextStation, platform }
       NOTE: This endpoint may be rate-limited or blocked by CORS in browser.
       When unavailable, cards show "Live N/A" — schedule data is still shown. -- */
    async function fetchTrainLive(trainNo, signal) {
      const key = `live:train:${trainNo}`;
      return fetchSWR(key, async () => {
        const url = `${Config.RAILRADAR_BASE}/trains/${trainNo}/live`;
        return _fetch(url, { signal });
      }, { ttl: Config.CACHE_TTL_MS });
    }

    /* -- 3f. Batch live hydration for visible train cards -- */
    async function hydrateBatch(trainNumbers) {
      const settled = await Promise.allSettled(
        trainNumbers.map(n => fetchTrainLive(n, timeoutSignal(8000)))
      );

      /* Build a map: trainNo → live data (undefined if failed) */
      const map = {};
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          map[trainNumbers[i]] = result.value.data;
        }
      });
      return map;
    }

    return { loadSchedules, fetchLiveArrivals, fetchTrainLive, hydrateBatch };
  })();

  /* =========================================================================
     4. SEARCH - station prefix-match autocomplete
     ========================================================================= */
  const Search = (() => {
    /* Flat array of { code, name, line } populated from schedules */
    let _stations = [];

    function index(scheduleData) {
      _stations = [];
      const seen = new Set();
      Config.LINES.forEach(line => {
        (scheduleData.stations?.[line] ?? []).forEach(s => {
          const key = `${s.code}:${line}`;
          if (!seen.has(key)) {
            _stations.push({ code: s.code, name: s.name, line });
            seen.add(key);
          }
        });
      });
    }

    /* Simple linear scan - fast enough for ~80 stations */
    function query(text, line = null) {
      if (!text || text.length < 1) return [];
      const q = text.toLowerCase();
      return _stations
        .filter(s => (line ? s.line === line : true) &&
                     (s.name.toLowerCase().startsWith(q) ||
                      s.code.toLowerCase().startsWith(q)))
        .slice(0, 8);
    }

    function getByCode(code, line) {
      return _stations.find(s => s.code === code && s.line === line) ?? null;
    }

    return { index, query, getByCode };
  })();

  /* =========================================================================
     5. UI - DOM binding, RAF render queue
     ========================================================================= */

  // Initialize Amber Dawn UI
  const App = (() => {
    let _scheduleData = null;
    let _activeTrainPoll = null;
    let _pollId = null;
    let _alertId = null;

    /* -- 5a. Show loading skeleton in the train list -- */
    function _setLoading(loading) {
      const list = document.getElementById('trainList');
      if (!list) return;
      if (loading) {
        list.innerHTML = `
          <div class="loading-state" aria-live="polite" aria-label="Loading trains">
            <div class="spinner" aria-hidden="true"></div>
            <p>Loading trains…</p>
          </div>`;
      }
    }

    /* -- 5b. Wire line-tab buttons; restore active tab from saved prefs -- */
    function _initLineTabs() {
      const tabs = document.querySelectorAll('.line-tab');
      const savedLine = Store.getPrefs().line || 'western';

      /* Restore active state */
      tabs.forEach(tab => {
        const isActive = tab.dataset.line === savedLine;
        tab.classList.toggle('active', isActive);
        if (isActive) tab.setAttribute('aria-current', 'page');
        else           tab.removeAttribute('aria-current');
      });

      /* Click handler */
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          _requestNotifPermission();
          const selectedLine = tab.dataset.line;

          tabs.forEach(t => {
            t.classList.remove('active');
            t.removeAttribute('aria-current');
          });
          tab.classList.add('active');
          tab.setAttribute('aria-current', 'page');

          Store.savePrefs({ line: selectedLine });
          if (_scheduleData) _renderHome();
        });
      });
    }

    async function boot() {
      console.log(`[TrainTrack] Booting v${Config.VERSION} (Amber Dawn)…`);

      initBottomNav();
      _initLineTabs();
      initSearch(App, Store, Search);

      const greetingEl = document.getElementById('greeting');
      if (greetingEl) greetingEl.textContent = getGreeting() + ', Traveler';

      /* Show skeleton immediately */
      _setLoading(true);

      try {
        const cached = await Store.getCachedSchedules();
        if (cached) {
          _scheduleData = cached;
          Search.index(cached);
          _renderHome();
          _renderSavedJourneys();
        }

        const { data: freshData } = await API.loadSchedules();
        _scheduleData = freshData;
        await Store.cacheSchedules(freshData);
        Search.index(freshData);
        if (!cached) {
          _renderHome();
          _renderSavedJourneys();
        }

      } catch (e) {
        console.error('[TrainTrack] Failed to load schedule data:', e);
        const list = document.getElementById('trainList');
        if (list) {
          list.innerHTML = `
            <div class="empty-state" role="alert">
              <span class="empty-icon" aria-hidden="true">⚠️</span>
              <p>Could not load train data.</p>
              <p class="empty-hint">Check your connection and refresh.</p>
            </div>`;
        }
      }

      _updateCountdowns();
      _pollId  = setInterval(_updateCountdowns, 60_000);
      _scheduleDepartureAlert();
      _alertId = setInterval(_scheduleDepartureAlert, 60_000);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          clearInterval(_pollId);
          clearInterval(_alertId);
        } else {
          _updateCountdowns();
          _scheduleDepartureAlert();
          _pollId  = setInterval(_updateCountdowns, 60_000);
          _alertId = setInterval(_scheduleDepartureAlert, 60_000);
        }
      });

      window.addEventListener('online', () => {
        console.log('[TrainTrack] Back online — refreshing…');
        _renderHome();
      });

      window.addEventListener('traintrack:station-changed', () => {
        _renderHome();
        _renderSavedJourneys();
      });
    }

    function _renderHome() {
      const prefs  = Store.getPrefs();
      const line   = prefs.line || 'western';
      const allTrains = _scheduleData?.trains?.[line] || [];
      const list   = document.getElementById('trainList');
      if (!list) return;

      /* Filter to upcoming trains within 2-hour window from saved from-station */
      const upcoming = prefs.from
        ? getNextDepartures(allTrains, prefs.from, 5)
        : allTrains.slice(0, 5);

      list.innerHTML = '';

      /* Empty state */
      if (upcoming.length === 0) {
        const lineNames = {
          western: 'Western',
          central: 'Central',
          harbour: 'Harbour',
          trans_harbour: 'Trans-Harbour',
          metro_aqua: 'Metro Line 1 (Aqua)',
          metro_red: 'Metro Line 2A (Red)',
          metro_yellow: 'Metro Line 7 (Yellow)'
        };
        const displayName = lineNames[line] || line.replace('_', '-');

        list.innerHTML = `
          <div class="empty-state" role="status">
            <span class="empty-icon" aria-hidden="true">🚉</span>
            <p>No upcoming trains on the <strong>${displayName}</strong> line.</p>
            <p class="empty-hint">Try a different line or check back soon.</p>
          </div>`;
        const hero = document.getElementById('nextTrainCard');
        if (hero) {
          hero.innerHTML = `
            <div class="empty-hero">
              <span class="empty-hero-icon" aria-hidden="true">🕰️</span>
              <p>No trains in the next 2 hours.</p>
            </div>`;
        }
        return;
      }

      /* Render train cards */
      const favs = Store.getFavourites();
      upcoming.forEach(t => {
        const rawFrom = t.from || t.origin || (t.route || t.stops || [])[0] || '';
        const rawTo   = t.to || t.destination || ((t.route || t.stops || []).at(-1)) || '';
        const rawLine = t.line || prefs.line;
        const savedKey = `${rawFrom}|${rawTo}|${rawLine}`;
        const isSaved  = favs.some(f => `${f.from}|${f.to}|${f.line}` === savedKey);

        const card = createTrainCard(t, {
          isSaved,
          onSave: (from, to, line, nowSaved) => {
            if (nowSaved) Store.addFavourite(from, to, line);
            else          Store.removeFavourite(from, to, line);
            _renderSavedJourneys();
          },
        });

        card.addEventListener('click', () => {
          const hc = document.querySelector('.home-container');
          const jt = document.getElementById('journeyTracker');
          if (hc) hc.style.display = 'none';
          if (jt) jt.style.display = 'block';

          initJourneyTracker(t, () => {
            stopJourneyTracking();
            if (_activeTrainPoll) clearInterval(_activeTrainPoll);
            if (jt) jt.style.display = 'none';
            if (hc) hc.style.display = 'block';
            setActiveViewToHome();
          });

          const route = t.route || t.stops || [];
          const origin      = route[0] ?? t.from ?? '';
          const destination = route.length ? route[route.length - 1] : (t.to ?? '');
          updateETA(calculateETA(origin, destination, t));
        });

        list.appendChild(card);

        /* Hydrate with live delay status */
        const trainId = t.trainNo || t.number || t.train_id;
        if (trainId) {
          API.fetchTrainLive(trainId, timeoutSignal(8000))
            .then(res => {
              const liveData  = res.data;
              const delayInfo = liveData
                ? { delayed: liveData.delay > 0, delayMinutes: liveData.delay }
                : null;
              card.updateStatus(delayInfo, false);
            })
            .catch(() => {
              /* RailRadar unavailable (CORS block or offline) - show subtle indicator */
              card.updateStatus(null, true);
            });
        }
      });

      /* Hero "next train" card */
      const hero = document.getElementById('nextTrainCard');
      if (hero && upcoming.length > 0) {
        const next  = upcoming[0];
        const route = next.route || next.stops || [];
        const fromLabel = escapeHTML(next.from || route[0] || '');
        const toLabel   = escapeHTML(next.to || (route.length ? route[route.length - 1] : ''));
        const typeStr   = escapeHTML(next.type || 'Local');
        
        const depTimeRaw   = next.departures?.[0]?.time || '00:00';
        const countdownRaw = calculateCountdown(depTimeRaw);
        const countdownNum = parseInt(countdownRaw, 10);
        const isStatusText = isNaN(countdownNum);
        const displayStr   = isStatusText ? escapeHTML(countdownRaw) : String(countdownNum);
        const pct          = isStatusText ? 0 : Math.max(0, Math.min(100, ((120 - countdownNum) / 120) * 100));
        const platform     = escapeHTML(String(next.departures?.[0]?.platform || 1));

        hero.style.setProperty('--progress', `${pct}%`);
        hero.innerHTML = `
          <div class="hero-body">
            <div class="hero-route-info">
              <h2>${fromLabel} → ${toLabel}</h2>
              <span class="hero-train-type">${typeStr}</span>
              <span class="hero-platform">Platform ${platform}</span>
            </div>
            <div class="hero-ring-wrapper" aria-label="${displayStr}${isStatusText ? '' : ' minutes until departure'}">
              <div class="hero-ring">
                <span class="hero-countdown" id="hero-countdown" data-departure="${escapeHTML(depTimeRaw)}">${displayStr}</span>
                ${isStatusText ? '' : '<span class="hero-unit">min</span>'}
              </div>
            </div>
          </div>
          <button class="cta-button" id="btnHeroLeavNow">Leave Now</button>`;

        document.getElementById('btnHeroLeavNow')?.addEventListener('click', () => {
          const hc = document.querySelector('.home-container');
          const jt = document.getElementById('journeyTracker');
          initJourneyTracker(next, () => {
            stopJourneyTracking();
            if (jt) jt.style.display = 'none';
            if (hc) hc.style.display = 'block';
            setActiveViewToHome();
          });
          if (hc) hc.style.display = 'none';
          if (jt) jt.style.display = 'block';
        });
      }
    }

    /* Segment C: departure alert — fires when next train is ≤ walkTime+10 min away */
    let _lastAlertedTrain = null;
    function _scheduleDepartureAlert() {
      if (!_scheduleData) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const prefs     = Store.getPrefs();
      const line      = prefs.line || 'western';
      const allTrains = _scheduleData?.trains?.[line] || [];
      const upcoming  = prefs.from ? getNextDepartures(allTrains, prefs.from, 1) : [];
      if (!upcoming.length) return;

      const next       = upcoming[0];
      const depTime    = next.departures?.[0]?.time || next.departureTime;
      if (!depTime) return;

      const walkMins   = ls_get_raw(Config.WALK_TIME_KEY) ?? Config.DEFAULT_WALK_TIME;
      const threshold  = walkMins + 10;
      const nowMins    = new Date().getHours() * 60 + new Date().getMinutes();
      const [dh, dm]   = depTime.split(':').map(Number);
      const depMins    = dh * 60 + dm;
      const minsAway   = depMins - nowMins;

      const alertKey = `${next.trainNo}:${depTime}`;
      if (minsAway > 0 && minsAway <= threshold && _lastAlertedTrain !== alertKey) {
        _lastAlertedTrain = alertKey;
        new Notification('TrainTrack — Time to leave!', {
          body: `${escapeHTML(next.name || 'Your train')} departs in ${minsAway} min. Walk time: ${walkMins} min.`,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: 'departure-alert',
        });
      }
    }

    /* Request notification permission on first meaningful interaction */
    function _requestNotifPermission() {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    function ls_get_raw(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }

    const _LINE_VAR = {
      western: '--western', central: '--central', harbour: '--harbour',
      trans_harbour: '--trans-harbour', metro_aqua: '--metro-aqua',
      metro_red: '--metro-red', metro_yellow: '--metro-yellow',
    };

    function _renderSavedJourneys() {
      const container = document.querySelector('.journey-list');
      if (!container) return;

      const favs = Store.getFavourites();
      container.innerHTML = '';

      if (favs.length === 0) {
        container.innerHTML = '<p class="no-saved-hint">Tap the bookmark on a train to save a journey.</p>';
        return;
      }

      favs.forEach(({ from, to, line }) => {
        const lineVar = _LINE_VAR[line] || '--primary';
        const badge = document.createElement('div');
        badge.className = 'journey-badge';
        badge.tabIndex = 0;
        badge.setAttribute('role', 'button');
        badge.setAttribute('aria-label', `Select ${from} to ${to} journey`);
        badge.innerHTML = `
          <span class="journey-dot" style="background:var(${lineVar})" aria-hidden="true"></span>
          <span class="journey-route">${escapeHTML(from)} → ${escapeHTML(to)}</span>
          <button class="journey-swap" aria-label="Swap direction" title="Swap">⇄</button>
          <button class="journey-remove" aria-label="Remove saved journey" title="Remove">×</button>
        `;

        badge.addEventListener('click', (e) => {
          if (e.target.closest('.journey-remove') || e.target.closest('.journey-swap')) return;
          Store.savePrefs({ from, to, line });
          _renderHome();
          _renderSavedJourneys();
        });

        badge.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            Store.savePrefs({ from, to, line });
            _renderHome();
            _renderSavedJourneys();
          }
        });

        badge.querySelector('.journey-swap').addEventListener('click', (e) => {
          e.stopPropagation();
          Store.savePrefs({ from: to, to: from, line });
          _renderHome();
          _renderSavedJourneys();
        });

        badge.querySelector('.journey-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          Store.removeFavourite(from, to, line);
          _renderSavedJourneys();
          _renderHome();
        });

        container.appendChild(badge);
      });
    }

    function _updateCountdowns() {
      /* Update hero countdown */
      const heroEl = document.getElementById('hero-countdown');
      if (heroEl?.dataset.departure) {
        const raw = calculateCountdown(heroEl.dataset.departure);
        const num = parseInt(raw, 10);
        heroEl.textContent = isNaN(num) ? raw : String(num);
        const hero = document.getElementById('nextTrainCard');
        if (hero && !isNaN(num)) {
          const pct = Math.max(0, Math.min(100, ((120 - num) / 120) * 100));
          hero.style.setProperty('--progress', `${pct}%`);
        }
      }

      /* Update all train card countdown pills */
      document.querySelectorAll('.train-card-countdown[data-departure]').forEach(el => {
        const raw = calculateCountdown(el.dataset.departure);
        const num = parseInt(raw, 10);
        el.textContent = isNaN(num) ? raw : `in ${num} min`;
      });
    }

    return { boot, getScheduleData: () => _scheduleData };
  })();

  return { Config, Store, API, Search, App };
})();

window.TrainTrack = TrainTrack;

/* Boot */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.TrainTrack.App.boot());
} else {
  window.TrainTrack.App.boot();
}

export const { Config, Store, API, Search, App } = TrainTrack;
