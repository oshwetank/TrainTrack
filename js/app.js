import { createTrainCard } from './components/trainCard.js';
import { initJourneyTracker, updateETA } from './components/journeyTracker.js';
import { initBottomNav } from './components/bottomNav.js';
import { getGreeting, calculateCountdown, calculateETA } from './utils/timeUtils.js';

/**
 * TrainTrack - app.js
 * Mumbai Local Train Tracker Â· Phase 3: Bloom (PWA Resilience)
 *
 * Architecture: Single TrainTrack namespace, Vanilla JS (zero framework)
 * Strategy:    Stale-While-Revalidate - render schedules.json instantly,
 *              hydrate with RailRadar live data in background.
 *              Background Sync API for schedule refresh on reconnect.
 * Performance: All DOM mutations via requestAnimationFrame
 *              30-second live polling (paused on Page Visibility hidden)
 *              AbortSignal.timeout(8000) on all outbound fetches
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
    VERSION: '1.3.0',

    /* Static dataset - served from same origin, always available */
    SCHEDULES_URL:    './schedules.json',
    DISRUPTIONS_URL:  './disruptions.json',

    /* RailRadar live API - third-party aggregator (railradar.in) */
    RAILRADAR_BASE: 'https://railradar.in/api',

    /* How long (ms) before a live API response is considered stale */
    CACHE_TTL_MS: 30_000,

    /* Polling interval for live hydration */
    POLL_INTERVAL_MS: 30_000,

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

    /* Suburban Lines */
    LINES: ['western', 'central', 'harbour', 'trans_harbour'],
    LINE_COLORS: {
      western: '#3b82f6',
      central: '#ef4444',
      harbour: '#8b5cf6',
      trans_harbour: '#10b981',  // Green
    },

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
    /* In-memory response cache: key â†’ { data, ts } */
    const _cache = new Map();

    /* -- 3a. Core fetch wrapper - JSON only -- */
    async function _fetch(url, opts = {}) {
      const res = await fetch(url, {
        signal: opts.signal ?? AbortSignal.timeout(8000),
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
       Returns { trainNo, currentStation, delay, nextStation, platform }  -- */
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
        trainNumbers.map(n => fetchTrainLive(n, AbortSignal.timeout(8000)))
      );

      /* Build a map: trainNo â†’ live data (undefined if failed) */
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

    async function boot() {
      console.log('Booting Amber Dawn UI...');
      
      initBottomNav();
      
      const greetingEl = document.getElementById('greeting');
      if(greetingEl) greetingEl.textContent = getGreeting() + ', Traveler';

      try {
        const cached = await Store.getCachedSchedules();
        if (cached) {
          _scheduleData = cached;
          _renderHome();
        }

        const { data: freshData } = await API.loadSchedules();
        _scheduleData = freshData;
        await Store.cacheSchedules(freshData);
        if (!cached) _renderHome();

      } catch (e) {
        console.error('Failed to load schedules', e);
      }
      
      setInterval(_updateCountdowns, 60000);
      
      window.addEventListener('online', () => {
         console.log("Back online!");
         _renderHome(); // Fetch live data
      });
    }
    
    function _renderHome() {
      const line = Store.getPrefs().line || "western";\n      const trains = _scheduleData?.trains?.[line] || [];
      const list = document.getElementById('trainList');
      if (!list) return;
      
      list.innerHTML = '';
      const upcoming = trains.slice(0, 5);
      
      upcoming.forEach(t => {
        const card = createTrainCard(t);
        card.addEventListener('click', () => {
           const hc = document.querySelector('.home-container');
           const jt = document.getElementById('journeyTracker');
           if (hc) hc.style.display = 'none';
           if (jt) jt.style.display = 'block';
           initJourneyTracker(t, () => {
              if (hc) hc.style.display = 'block';
              if (jt) jt.style.display = 'none';
              if(_activeTrainPoll) clearInterval(_activeTrainPoll);
           });
           
           const route = t.route || t.stops || [];
           const origin = route[0] ?? t.from ?? '';
           const destination = route.length ? route[route.length - 1] : (t.to ?? '');
           updateETA(calculateETA(origin, destination, t));
        });
        list.appendChild(card);
        
        const trainId = t.trainNo || t.number || t.train_id;
        API.fetchTrainLive(trainId, AbortSignal.timeout(8000))
          .then(res => {
            const delayInfo = res.data ? { delayed: res.data.delay > 0, delayMinutes: res.data.delay } : null;
            card.updateStatus(delayInfo);
          }).catch(() => {
             // Mock data if CORS block or offline
             card.updateStatus(null);
          });
      });
      
      const hero = document.getElementById('nextTrainCard');
      if (hero && upcoming.length > 0) {
        const next = upcoming[0];
        const route = next.route || next.stops || [];
        const fromLabel = next.from || route[0] || '';
        const toLabel = next.to || (route.length ? route[route.length - 1] : '');
        hero.innerHTML = `
          <div class="route-info">
            <h2>${fromLabel} to ${toLabel}</h2>
            <span class="train-type">${next.type}</span>
          </div>
          <div class="departure-info">
            <div class="countdown">
              <span class="time" id="hero-countdown">${calculateCountdown(next.departures?.[0]?.time || '00:00')}</span>
              <span class="unit">MINUTES</span>
            </div>
            <div class="platform">Platform ${next.departures?.[0]?.platform || 1}</div>
          </div>
          <button class="cta-button" onclick="document.getElementById('journeyTracker').style.display='block'; document.querySelector('.home-container').style.display='none';">Leave Now!</button>`;
      }
    }
    
    function _updateCountdowns() {
      _renderHome();
    }

    return { boot, getScheduleData: () => _scheduleData };
  })();

  return { Config, Store, API, Search, App };
})();

window.TrainTrack = TrainTrack;

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.TrainTrack.App.boot());
} else {
  window.TrainTrack.App.boot();
}

export const { Config, Store, API, Search, App } = TrainTrack;
