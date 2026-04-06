/**
 * TrainTrack — app.js
 * Mumbai Local Train Tracker · Phase 3: Bloom (PWA Resilience)
 *
 * Architecture: Single TrainTrack namespace, Vanilla JS (zero framework)
 * Strategy:    Stale-While-Revalidate — render schedules.json instantly,
 *              hydrate with RailRadar live data in background.
 *              Background Sync API for schedule refresh on reconnect.
 * Performance: All DOM mutations via requestAnimationFrame
 *              30-second live polling (paused on Page Visibility hidden)
 *              AbortSignal.timeout(8000) on all outbound fetches
 *
 * Modules:
 *   TrainTrack.Config    — constants, API endpoints, cache keys
 *   TrainTrack.Store     — localStorage prefs/favs + IndexedDB schedule cache
 *   TrainTrack.API       — fetch wrapper with in-memory SWR cache
 *   TrainTrack.Search    — O(n) station prefix-match autocomplete
 *   TrainTrack.UI        — RAF render queue, template cloning, glass drawer
 *   TrainTrack.Scheduler — visibility-aware 30s polling manager
 *   TrainTrack.App       — bootstrap & event orchestration
 */

/* ─────────────────────────────────────────────────────────────────────────── */
/* 0. NAMESPACE GUARD                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */
if (window.TrainTrack) {
  console.warn('[TrainTrack] app.js loaded more than once — skipping re-init.');
}

window.TrainTrack = (() => {
  'use strict';

  /* =========================================================================
     1. CONFIG
     ========================================================================= */
  const Config = Object.freeze({
    VERSION: '1.1.0',

    /* Static dataset — served from same origin, always available */
    SCHEDULES_URL: './schedules.json',

    /* RailRadar live API — third-party aggregator (railradar.in)
       Free-tier endpoints; falls back gracefully if unreachable.
       Replace with your key-authenticated base URL if available. */
    RAILRADAR_BASE: 'rr_gzlo8ma4e46gy2jkkxd8jz1vn4o9zmdu',

    /* How long (ms) before a live API response is considered stale */
    CACHE_TTL_MS: 30_000,

    /* Polling interval for live hydration */
    POLL_INTERVAL_MS: 30_000,

    /* localStorage keys */
    LS_LINE:     'tt_line',
    LS_FROM:     'tt_from',
    LS_TO:       'tt_to',
    LS_FAVS:     'tt_favs',
    LS_CLOCK24:  'tt_clock24',
    LS_REFRESH:  'tt_autorefresh',

    /* IndexedDB */
    IDB_NAME:    'traintrack-db',
    IDB_VERSION: 1,
    IDB_STORE:   'schedule-cache',

    /* Lines */
    LINES: ['western', 'central', 'harbour'],
    LINE_COLORS: {
      western: '#3b82f6',
      central: '#ef4444',
      harbour: '#8b5cf6',
    },
  });

  /* =========================================================================
     2. STORE — localStorage & IndexedDB
     ========================================================================= */
  const Store = (() => {
    /* ── 2a. localStorage helpers ── */
    function ls_get(key, fallback = null) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    }
    function ls_set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { console.warn('[Store] localStorage write failed:', e); }
    }

    /* ── 2b. Preferences ── */
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

    /* ── 2c. Favourites ── */
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

    /* ── 2d. IndexedDB — schedule cache ── */
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
     3. API — Fetch with Stale-While-Revalidate
     ========================================================================= */
  const API = (() => {
    /* In-memory response cache: key → { data, ts } */
    const _cache = new Map();

    /* ── 3a. Core fetch wrapper — JSON only ── */
    async function _fetch(url, opts = {}) {
      const res = await fetch(url, {
        signal: opts.signal,
        headers: { 'Accept': 'application/json', ...(opts.headers ?? {}) },
        ...opts,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return res.json();
    }

    /* ── 3b. Stale-While-Revalidate wrapper ── */
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

      /* No cache at all — must await */
      const data = await fetchFn();
      _cache.set(key, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    /* ── 3c. Load static schedules.json (always succeeds — local file) ── */
    async function loadSchedules() {
      const key = 'local:schedules';
      return fetchSWR(key, () => _fetch(Config.SCHEDULES_URL), { ttl: Infinity });
    }

    /* ── 3d. RailRadar live station arrivals ─────────────────────────────
       Endpoint: GET /api/station/{stationCode}/arrivals
       Free public endpoint — no key required for basic lookup.
       Returns array of { trainNo, name, eta, delay, platform }
       Falls back silently on network error or CORS block.              ── */
    async function fetchLiveArrivals(stationCode, signal) {
      const key = `live:arrivals:${stationCode}`;
      return fetchSWR(key, async () => {
        const url = `${Config.RAILRADAR_BASE}/station/${stationCode}/arrivals`;
        return _fetch(url, { signal });
      }, { ttl: Config.CACHE_TTL_MS });
    }

    /* ── 3e. RailRadar live train status ─────────────────────────────────
       Endpoint: GET /api/trains/{trainNo}/live
       Returns { trainNo, currentStation, delay, nextStation, platform }  ── */
    async function fetchTrainLive(trainNo, signal) {
      const key = `live:train:${trainNo}`;
      return fetchSWR(key, async () => {
        const url = `${Config.RAILRADAR_BASE}/trains/${trainNo}/live`;
        return _fetch(url, { signal });
      }, { ttl: Config.CACHE_TTL_MS });
    }

    /* ── 3f. Batch live hydration for visible train cards ── */
    async function hydrateBatch(trainNumbers) {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 8000); /* 8s hard timeout */

      const settled = await Promise.allSettled(
        trainNumbers.map(n => fetchTrainLive(n, ac.signal))
      );
      clearTimeout(timeout);

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
     4. SEARCH — station prefix-match autocomplete
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

    /* Simple linear scan — fast enough for ~80 stations */
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
     5. UI — DOM binding, RAF render queue
     ========================================================================= */
  const UI = (() => {
    /* ── Element references (queried once at init) ── */
    let els = {};

    /* ── RAF queue — batch all DOM mutations into single frames ── */
    let _rafId = null;
    const _renderQueue = [];

    function enqueue(fn) {
      _renderQueue.push(fn);
      if (!_rafId) {
        _rafId = requestAnimationFrame(_flush);
      }
    }

    function _flush() {
      _rafId = null;
      /* Drain the queue synchronously within this frame */
      while (_renderQueue.length) _renderQueue.shift()();
    }

    /* ── 5a. Init — cache DOM refs ── */
    function init() {
      els = {
        clock:          document.getElementById('live-clock'),
        liveBadge:      document.getElementById('live-badge'),
        offlineBadge:   document.getElementById('offline-badge'),
        lastUpdated:    document.getElementById('last-updated'),
        refreshBtn:     document.getElementById('refresh-btn'),
        refreshIcon:    document.getElementById('refresh-icon'),

        fromInput:      document.getElementById('from-station'),
        toInput:        document.getElementById('to-station'),
        swapBtn:        document.getElementById('swap-stations'),
        searchBtn:      document.getElementById('search-trains-btn'),
        autocomplete:   document.getElementById('autocomplete-list'),

        tabWestern:     document.getElementById('tab-western'),
        tabCentral:     document.getElementById('tab-central'),
        tabHarbour:     document.getElementById('tab-harbour'),

        boardLoading:   document.getElementById('board-loading'),
        trainList:      document.getElementById('train-list'),
        boardEmpty:     document.getElementById('board-empty'),
        boardError:     document.getElementById('board-error'),

        favsSection:    document.getElementById('favourites-section'),
        favsList:       document.getElementById('favourites-list'),

        navItems:       document.querySelectorAll('.nav-item'),
        settingsDrawer: document.getElementById('settings-drawer'),
        backdrop:       document.getElementById('drawer-backdrop'),
        closeSettings:  document.getElementById('close-settings'),

        notifToggle:    document.getElementById('notif-toggle'),
        clock24Toggle:  document.getElementById('clock-format-toggle'),
        autorefToggle:  document.getElementById('autorefresh-toggle'),

        trainCardTpl:   document.getElementById('train-card-tpl'),
        favRouteTpl:    document.getElementById('fav-route-tpl'),
      };
    }

    /* ── 5b. Clock ── */
    let _clock24 = true;
    function startClock(use24 = true) {
      _clock24 = use24;
      function tick() {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        const pad = n => String(n).padStart(2, '0');
        let display;
        if (_clock24) {
          display = `${pad(h)}:${pad(m)}:${pad(s)}`;
        } else {
          const h12 = h % 12 || 12;
          display = `${pad(h12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
        }
        els.clock.textContent = display;
        els.clock.dateTime = now.toISOString();
      }
      tick();
      setInterval(tick, 1000);
    }
    function setClock24(flag) { _clock24 = flag; }

    /* ── 5c. Online/Offline badge ── */
    function setOnlineState(online) {
      enqueue(() => {
        els.liveBadge.classList.toggle('hidden', !online);
        els.offlineBadge.classList.toggle('hidden', online);
      });
    }

    /* ── 5d. Line tab selection ── */
    let _currentLine = 'western';
    function setActiveLine(line) {
      _currentLine = line;
      enqueue(() => {
        const tabs = { western: els.tabWestern, central: els.tabCentral, harbour: els.tabHarbour };
        Object.entries(tabs).forEach(([l, tab]) => {
          tab.classList.toggle('active', l === line);
          tab.setAttribute('aria-selected', String(l === line));
        });
        /* Update aria-labelledby on board panel */
        const activeTab = tabs[line];
        if (activeTab) {
          els.trainList.closest('[role="tabpanel"]')?.setAttribute('aria-labelledby', activeTab.id);
        }
      });
    }

    /* ── 5e. Board states ── */
    function showLoading() {
      enqueue(() => {
        els.boardLoading.classList.remove('hidden');
        els.trainList.classList.add('hidden');
        els.boardEmpty.classList.add('hidden');
        els.boardError.classList.add('hidden');
      });
    }

    function showEmpty() {
      enqueue(() => {
        els.boardLoading.classList.add('hidden');
        els.trainList.classList.add('hidden');
        els.boardEmpty.classList.remove('hidden');
        els.boardError.classList.add('hidden');
      });
    }

    function showError() {
      enqueue(() => {
        els.boardLoading.classList.add('hidden');
        els.trainList.classList.add('hidden');
        els.boardEmpty.classList.add('hidden');
        els.boardError.classList.remove('hidden');
      });
    }

    function showList() {
      enqueue(() => {
        els.boardLoading.classList.add('hidden');
        els.trainList.classList.remove('hidden');
        els.boardEmpty.classList.add('hidden');
        els.boardError.classList.add('hidden');
      });
    }

    /* ── 5f. Last-updated label ── */
    function updateTimestamp() {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      enqueue(() => {
        els.lastUpdated.textContent = `Updated ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      });
    }

    /* ── 5g. Refresh icon spin ── */
    function setRefreshing(spinning) {
      enqueue(() => {
        els.refreshIcon?.classList.toggle('spin', spinning);
      });
    }

    /* ── 5h. Train card rendering ── */
    function formatTime(timeStr, use24) {
      if (!timeStr) return '—';
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
      const pad = n => String(n).padStart(2, '0');
      if (use24) return `${pad(h)}:${pad(m)}`;
      const h12 = h % 12 || 12;
      return `${pad(h12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
    }

    /* Returns the next N upcoming departures from a train's departure list */
    function _getNextDepartures(departures, count = 3) {
      if (!departures?.length) return [];
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const withMins = departures.map(d => {
        const [h, m] = d.time.split(':').map(Number);
        const totalMins = h * 60 + m;
        /* Wrap around midnight: if departure is before now, it's tomorrow */
        const effective = totalMins < nowMins ? totalMins + 1440 : totalMins;
        return { ...d, effectiveMins: effective };
      });
      withMins.sort((a, b) => a.effectiveMins - b.effectiveMins);
      return withMins.slice(0, count);
    }

    /* Compute ETA display string from departure time + live delay */
    function _computeETA(departureTime, delayMins = 0) {
      const [h, m] = departureTime.split(':').map(Number);
      const etaMins = h * 60 + m + delayMins;
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const diffMins = (etaMins % 1440) - nowMins;
      if (diffMins < 0) return null; /* already departed */
      if (diffMins === 0) return 'Now';
      if (diffMins < 60) return `${diffMins} min`;
      return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
    }

    function _statusBadge(delayMins) {
      if (delayMins === undefined || delayMins === null) return { cls: 'badge badge-on-time', text: 'On Time' };
      if (delayMins === 0)   return { cls: 'badge badge-on-time', text: 'On Time' };
      if (delayMins === -1)  return { cls: 'badge badge-cancelled', text: 'Cancelled' };
      return { cls: 'badge badge-delayed', text: `+${delayMins} min` };
    }

    /* Build a single <li> train card from a train object + optional live override */
    function _buildCard(train, departure, line, liveOverride = null) {
      const tpl = els.trainCardTpl.content.cloneNode(true);
      const li = tpl.querySelector('.train-card');
      li.dataset.trainNumber = train.number;
      li.dataset.line = line;

      /* LEFT COLOUR BAR handled by CSS via data-line */

      /* Content slots */
      tpl.querySelector('.train-name').textContent = train.name;
      tpl.querySelector('.train-number').textContent = `#${train.number} · ${train.type.toUpperCase()}`;

      const fromStation = train.from;
      const toStation = train.to;
      tpl.querySelector('.train-route').textContent = `${fromStation} → ${toStation}`;

      const delay = liveOverride?.delay ?? 0;
      const platform = liveOverride?.platform ?? departure.platform;
      const effectiveTime = departure.time; /* real departure time from schedule */

      tpl.querySelector('.train-depart-time').textContent = formatTime(effectiveTime, _clock24);
      tpl.querySelector('.train-depart-time').dateTime = effectiveTime;
      tpl.querySelector('.train-platform').textContent = `Pf. ${platform}`;

      const eta = _computeETA(effectiveTime, delay);
      tpl.querySelector('.train-eta-value').textContent = eta ?? '—';

      const { cls, text } = _statusBadge(liveOverride ? delay : undefined);
      const badge = tpl.querySelector('.train-status-badge');
      badge.className = cls;
      badge.textContent = text;

      return tpl;
    }

    /**
     * Render the full train board from static data.
     * @param {object} scheduleData  - parsed schedules.json
     * @param {string} line          - 'western' | 'central' | 'harbour'
     * @param {string|null} from     - station code filter (or null = all)
     * @param {string|null} to       - station code filter (or null = all)
     */
    function renderBoard(scheduleData, line, from = null, to = null) {
      const trains = scheduleData.trains?.[line] ?? [];

      /* Filter trains that serve both from and to (in order) */
      const filtered = trains.filter(t => {
        if (from && !t.stops.includes(from)) return false;
        if (to   && !t.stops.includes(to))   return false;
        if (from && to) {
          return t.stops.indexOf(from) < t.stops.indexOf(to);
        }
        return true;
      });

      if (!filtered.length) { showEmpty(); return; }

      /* For each train, grab next 1 departure */
      const cards = [];
      filtered.forEach(train => {
        const next = _getNextDepartures(train.departures, 1);
        if (next.length) cards.push({ train, departure: next[0] });
      });

      /* Sort by effective departure time (soonest first) */
      cards.sort((a, b) => a.departure.effectiveMins - b.departure.effectiveMins);

      if (!cards.length) { showEmpty(); return; }

      enqueue(() => {
        /* Build fragment for batch DOM insertion (single reflow) */
        const frag = document.createDocumentFragment();
        cards.forEach(({ train, departure }) => {
          frag.appendChild(_buildCard(train, departure, line));
        });
        els.trainList.innerHTML = '';
        els.trainList.appendChild(frag);
        showList();
      });
    }

    /**
     * Hydrate existing train cards with live data (NO full re-render).
     * Only updates: departure time, platform, status badge, ETA.
     * @param {object} liveMap - { trainNumber → live API response }
     */
    function hydrateBoard(liveMap) {
      if (!liveMap || !Object.keys(liveMap).length) return;

      enqueue(() => {
        const cards = els.trainList.querySelectorAll('.train-card');
        cards.forEach(card => {
          const num = card.dataset.trainNumber;
          const live = liveMap[num];
          if (!live) return;

          /* Micro-update only affected elements — no innerHTML, no reflow */
          const delay = live.delay ?? 0;
          const platform = live.platform;

          const pfEl = card.querySelector('.train-platform');
          if (platform && pfEl) pfEl.textContent = `Pf. ${platform}`;

          const badge = card.querySelector('.train-status-badge');
          if (badge) {
            const { cls, text } = _statusBadge(delay);
            badge.className = cls;
            badge.textContent = text;
          }

          /* Recompute ETA from current scheduled time + delay */
          const timeEl = card.querySelector('.train-depart-time');
          const etaEl  = card.querySelector('.train-eta-value');
          if (timeEl && etaEl) {
            const eta = _computeETA(timeEl.dateTime || timeEl.textContent, delay);
            etaEl.textContent = eta ?? '—';
          }
        });
        updateTimestamp();
      });
    }

    /* ── 5i. Autocomplete ── */
    let _acTarget = null; /* 'from' or 'to' */
    let _acDebounce = null;

    function showAutocomplete(results, target) {
      _acTarget = target;
      enqueue(() => {
        if (!results.length) {
          els.autocomplete.classList.add('hidden');
          return;
        }
        const frag = document.createDocumentFragment();
        results.forEach(s => {
          const li = document.createElement('li');
          li.className = 'autocomplete-item';
          li.role = 'option';
          li.dataset.code = s.code;
          li.dataset.name = s.name;
          li.textContent = s.name;
          frag.appendChild(li);
        });
        els.autocomplete.innerHTML = '';
        els.autocomplete.appendChild(frag);
        els.autocomplete.classList.remove('hidden');
      });
    }

    function hideAutocomplete() {
      enqueue(() => els.autocomplete.classList.add('hidden'));
    }

    /* ── 5j. Favourites ── */
    function renderFavourites(favs, stationMap) {
      enqueue(() => {
        if (!favs.length) {
          els.favsSection.hidden = true;
          return;
        }
        const frag = document.createDocumentFragment();
        favs.forEach(fav => {
          const tpl = els.favRouteTpl.content.cloneNode(true);
          const item = tpl.querySelector('.fav-route-item');
          item.dataset.from = fav.from;
          item.dataset.to   = fav.to;
          item.dataset.line = fav.line;
          tpl.querySelector('.fav-from').textContent = stationMap[fav.from] ?? fav.from;
          tpl.querySelector('.fav-to').textContent   = stationMap[fav.to]   ?? fav.to;
          frag.appendChild(tpl);
        });
        els.favsList.innerHTML = '';
        els.favsList.appendChild(frag);
        els.favsSection.hidden = false;
      });
    }

    /* ── 5k. Settings drawer ── */
    function openSettings() {
      enqueue(() => {
        els.settingsDrawer.hidden = false;
        requestAnimationFrame(() => {
          els.settingsDrawer.classList.add('open');
          els.backdrop.classList.remove('hidden');
          els.backdrop.classList.add('visible');
        });
      });
    }
    function closeSettings() {
      els.settingsDrawer.classList.remove('open');
      els.backdrop.classList.remove('visible');
      setTimeout(() => {
        enqueue(() => {
          els.settingsDrawer.hidden = true;
          els.backdrop.classList.add('hidden');
        });
      }, 380); /* match CSS transition duration */
    }

    function syncToggle(el, value) {
      enqueue(() => {
        if (!el) return;
        el.setAttribute('aria-checked', String(value));
        el.classList.toggle('active', value);
      });
    }

    /* ── 5l. Nav active state ── */
    function setActiveNav(viewId) {
      enqueue(() => {
        els.navItems.forEach(item => {
          const isActive = item.dataset.view === viewId;
          item.classList.toggle('active', isActive);
          item.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
      });
    }

    return {
      init, startClock, setClock24, setOnlineState, setActiveLine,
      showLoading, showEmpty, showError, showList,
      renderBoard, hydrateBoard, updateTimestamp, setRefreshing,
      showAutocomplete, hideAutocomplete,
      renderFavourites, openSettings, closeSettings, syncToggle,
      setActiveNav,
      get els() { return els; },
      get currentLine() { return _currentLine; },
    };
  })();

  /* =========================================================================
     6. SCHEDULER — polling interval, page-visibility aware
     ========================================================================= */
  const Scheduler = (() => {
    let _timer = null;
    let _callback = null;
    let _enabled = true;

    function start(callback, intervalMs = Config.POLL_INTERVAL_MS) {
      stop();
      _callback = callback;
      _timer = setInterval(callback, intervalMs);
    }

    function stop() {
      if (_timer) { clearInterval(_timer); _timer = null; }
    }

    /* Pause when tab is hidden, resume on return — saves battery */
    document.addEventListener('visibilitychange', () => {
      if (!_enabled) return;
      if (document.hidden) {
        stop();
      } else if (_callback) {
        _callback(); /* immediate refresh on return */
        start(_callback);
      }
    });

    function setEnabled(flag) {
      _enabled = flag;
      if (!flag) stop();
      else if (_callback) start(_callback);
    }

    return { start, stop, setEnabled };
  })();

  /* =========================================================================
     7. APP — bootstrap & event orchestration
     ========================================================================= */
  const App = (() => {
    let _scheduleData = null;
    let _stationNameMap = {}; /* code → name, all lines */

    /* ── 7a. Build station name lookup map ── */
    function _buildStationMap(data) {
      const map = {};
      Config.LINES.forEach(line => {
        (data.stations?.[line] ?? []).forEach(s => { map[s.code] = s.name; });
      });
      return map;
    }

    /* ── 7b. Live hydration pass (background) ── */
    async function _hydrate() {
      if (!navigator.onLine || !_scheduleData) return;

      UI.setRefreshing(true);

      try {
        /* Collect train numbers currently visible in the board */
        const cards = UI.els.trainList?.querySelectorAll('.train-card') ?? [];
        const trainNumbers = [...new Set([...cards].map(c => c.dataset.trainNumber).filter(Boolean))];

        if (!trainNumbers.length) return;

        const liveMap = await API.hydrateBatch(trainNumbers);
        UI.hydrateBoard(liveMap);
        UI.setOnlineState(true);
      } catch (e) {
        console.warn('[App] Live hydration failed:', e.message);
        /* Don't flip offline — a single failure isn't conclusive */
      } finally {
        UI.setRefreshing(false);
      }
    }

    /* ── 7c. Render board for current selection ── */
    function _renderCurrent() {
      if (!_scheduleData) return;
      const prefs = Store.getPrefs();
      UI.showLoading();
      /* Use setTimeout 0 to yield to the browser before the render work */
      setTimeout(() => {
        UI.renderBoard(_scheduleData, UI.currentLine, prefs.from, prefs.to);
        UI.updateTimestamp();
      }, 0);
    }

    /* ── 7d. Line tab switch ── */
    function _onLineTabClick(e) {
      const tab = e.currentTarget;
      const line = tab.dataset.line;
      if (line === UI.currentLine) return;
      UI.setActiveLine(line);
      Store.savePrefs({ line });
      _renderCurrent();
    }

    /* ── 7e. Station input & autocomplete ── */
    function _onStationInput(e) {
      const input = e.currentTarget;
      const role = input.dataset.role; /* 'from' or 'to' */
      const text = input.value.trim();

      clearTimeout(UI._acDebounce);
      UI._acDebounce = setTimeout(() => {
        const results = Search.query(text, UI.currentLine);
        UI.showAutocomplete(results, role);
      }, 120); /* 120ms debounce */
    }

    function _onAutocompleteClick(e) {
      const item = e.target.closest('.autocomplete-item');
      if (!item) return;
      const code = item.dataset.code;
      const name = item.dataset.name;
      const target = UI.els.autocomplete._acTarget ?? 'from';

      if (target === 'from') {
        UI.els.fromInput.value = name;
        Store.savePrefs({ from: code });
      } else {
        UI.els.toInput.value = name;
        Store.savePrefs({ to: code });
      }
      UI.hideAutocomplete();
      _renderCurrent();
    }

    function _onStationFocus(e) {
      /* Store which input is active so autocomplete click knows the target */
      UI.els.autocomplete._acTarget = e.currentTarget.dataset.role;
    }

    function _onStationBlur() {
      /* Small delay so click on autocomplete fires first */
      setTimeout(() => UI.hideAutocomplete(), 150);
    }

    /* ── 7f. Swap stations ── */
    function _onSwap() {
      const prefs = Store.getPrefs();
      const { from, to } = prefs;
      Store.savePrefs({ from: to, to: from });
      UI.els.fromInput.value = _stationNameMap[to] ?? '';
      UI.els.toInput.value   = _stationNameMap[from] ?? '';
      _renderCurrent();
    }

    /* ── 7g. Manual search button ── */
    function _onSearch() {
      const fromText = UI.els.fromInput.value.trim();
      const toText   = UI.els.toInput.value.trim();

      /* Try to resolve code from display name */
      const fromStation = Search.query(fromText, UI.currentLine)[0];
      const toStation   = Search.query(toText,   UI.currentLine)[0];

      if (fromStation) Store.savePrefs({ from: fromStation.code });
      if (toStation)   Store.savePrefs({ to: toStation.code });

      UI.hideAutocomplete();
      _renderCurrent();
    }

    /* ── 7h. Refresh button ── */
    async function _onRefresh() {
      _renderCurrent();
      await _hydrate();
    }

    /* ── 7i. Bottom nav ── */
    function _onNavClick(e) {
      const btn = e.currentTarget;
      const view = btn.dataset.view;
      UI.setActiveNav(view);

      if (view === 'settings') {
        UI.openSettings();
        return;
      }
      if (view === 'favourites') {
        _loadFavourites();
      }
      /* home / search — scroll main into view */
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ── 7j. Favourites ── */
    function _loadFavourites() {
      const favs = Store.getFavourites();
      UI.renderFavourites(favs, _stationNameMap);
    }

    function _onFavClick(e) {
      const btn = e.target.closest('.fav-route-btn');
      const rmv = e.target.closest('.fav-remove-btn');
      if (rmv) {
        const item = rmv.closest('[data-from]');
        Store.removeFavourite(item.dataset.from, item.dataset.to, item.dataset.line);
        _loadFavourites();
        return;
      }
      if (btn) {
        const item = btn.closest('[data-from]');
        UI.setActiveLine(item.dataset.line);
        Store.savePrefs({ from: item.dataset.from, to: item.dataset.to, line: item.dataset.line });
        UI.els.fromInput.value = _stationNameMap[item.dataset.from] ?? '';
        UI.els.toInput.value   = _stationNameMap[item.dataset.to]   ?? '';
        _renderCurrent();
        UI.setActiveNav('home');
      }
    }

    /* ── 7k. Settings toggles ── */
    function _onClock24Toggle() {
      const prefs = Store.getPrefs();
      const next = !prefs.clock24;
      Store.savePrefs({ clock24: next });
      UI.setClock24(next);
      UI.syncToggle(UI.els.clock24Toggle, next);
      _renderCurrent(); /* re-render times in new format */
    }

    function _onAutorefToggle() {
      const prefs = Store.getPrefs();
      const next = !prefs.autoref;
      Store.savePrefs({ autoref: next });
      UI.syncToggle(UI.els.autorefToggle, next);
      Scheduler.setEnabled(next);
    }

    async function _onNotifToggle() {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') return;
      const result = await Notification.requestPermission();
      UI.syncToggle(UI.els.notifToggle, result === 'granted');
    }

    /* ── 7l. Background Sync registration ── */
    function _registerBgSync() {
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
          .then(sw => sw.sync.register('sync-schedules'))
          .catch(e => console.warn('[App] BgSync registration failed:', e));
      }
    }

    /* ── 7m. Online / offline events ── */
    let _offlineTimer = null;
    function _onOnline() {
      clearTimeout(_offlineTimer);
      UI.setOnlineState(true);
      _hydrate();
      _registerBgSync(); /* schedule a SW-managed refresh on reconnect */
    }
    function _onOffline() {
      /* Debounce 3 s — transient drops must not flash the OFFLINE badge */
      _offlineTimer = setTimeout(() => {
        if (!navigator.onLine) UI.setOnlineState(false);
      }, 3000);
    }

    /* ── 7m. Wire all events ── */
    function _bindEvents() {
      const { els } = UI;

      /* Line tabs */
      [els.tabWestern, els.tabCentral, els.tabHarbour].forEach(tab => {
        tab?.addEventListener('click', _onLineTabClick);
      });

      /* Station inputs */
      els.fromInput?.addEventListener('input', _onStationInput);
      els.toInput?.addEventListener('input',   _onStationInput);
      els.fromInput?.addEventListener('focus',  _onStationFocus);
      els.toInput?.addEventListener('focus',    _onStationFocus);
      els.fromInput?.addEventListener('blur',   _onStationBlur);
      els.toInput?.addEventListener('blur',     _onStationBlur);

      /* Autocomplete */
      els.autocomplete?.addEventListener('mousedown', _onAutocompleteClick);

      /* Swap + search */
      els.swapBtn?.addEventListener('click',    _onSwap);
      els.searchBtn?.addEventListener('click',  _onSearch);
      els.refreshBtn?.addEventListener('click', _onRefresh);

      /* Bottom nav */
      els.navItems?.forEach(btn => btn.addEventListener('click', _onNavClick));

      /* Settings */
      els.closeSettings?.addEventListener('click', UI.closeSettings.bind(UI));
      els.backdrop?.addEventListener('click',      UI.closeSettings.bind(UI));
      els.clock24Toggle?.addEventListener('click', _onClock24Toggle);
      els.autorefToggle?.addEventListener('click', _onAutorefToggle);
      els.notifToggle?.addEventListener('click',   _onNotifToggle);

      /* Favourites */
      els.favsList?.addEventListener('click', _onFavClick);

      /* Network */
      window.addEventListener('online',  _onOnline);
      window.addEventListener('offline', _onOffline);
    }

    /* ── 7n. Restore persisted UI state ── */
    function _restoreState(prefs) {
      UI.setActiveLine(prefs.line ?? 'western');
      UI.syncToggle(UI.els.clock24Toggle, prefs.clock24 ?? true);
      UI.syncToggle(UI.els.autorefToggle, prefs.autoref ?? true);

      if (prefs.from) UI.els.fromInput.value = _stationNameMap[prefs.from] ?? '';
      if (prefs.to)   UI.els.toInput.value   = _stationNameMap[prefs.to]   ?? '';

      /* Notification permission */
      if ('Notification' in window && Notification.permission === 'granted') {
        UI.syncToggle(UI.els.notifToggle, true);
      }
    }

    /* ── 7o. Bootstrap ── */
    async function boot() {
      UI.init();
      UI.showLoading();
      UI.startClock();
      UI.setOnlineState(navigator.onLine);

      /* STEP 1: Load schedules.json (stale-while-revalidate) ──────────────
         Try IDB cache first for instant render, then load fresh from network */
      try {
        /* Try cached version for instant paint */
        const cached = await Store.getCachedSchedules();
        if (cached) {
          _scheduleData = cached;
          _stationNameMap = _buildStationMap(cached);
          Search.index(cached);
          const prefs = Store.getPrefs();
          _restoreState(prefs);
          _renderCurrent();
        }

        /* Always fetch fresh schedules.json in background */
        const { data: freshData } = await API.loadSchedules();
        _scheduleData = freshData;
        _stationNameMap = _buildStationMap(freshData);
        Search.index(freshData);
        await Store.cacheSchedules(freshData);

        /* Only re-render if we had no cached data */
        if (!cached) {
          const prefs = Store.getPrefs();
          _restoreState(prefs);
          _renderCurrent();
        }

      } catch (e) {
        console.error('[App] Failed to load schedule data:', e);
        UI.showError();
        return;
      }

      /* STEP 2: Wire events */
      _bindEvents();

      /* STEP 3: Load favourites */
      _loadFavourites();

      /* STEP 4: Background live hydration + scheduler ─────────────────────
         Only when online; respects autorefresh preference               */
      const prefs = Store.getPrefs();
      if (prefs.autoref !== false) {
        /* First live refresh after schedules are shown */
        setTimeout(() => _hydrate(), 2000);
        /* Then every 30 seconds */
        Scheduler.start(_hydrate);
      }

      /* STEP 5: Register Background Sync so SW refreshes schedules on next
         network connection (even if the app is closed)                  */
      if (navigator.onLine) _registerBgSync();

      console.log(`[TrainTrack] v${Config.VERSION} booted ✓`);
    }

    return { boot };
  })();

  /* ─────────────────────────────────────────────────────────────────────────
     EXPORT public API
  ───────────────────────────────────────────────────────────────────────── */
  return { Config, Store, API, Search, UI, Scheduler, App };

})(); /* end TrainTrack IIFE */

/* ── Auto-boot on DOMContentLoaded ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TrainTrack.App.boot());
} else {
  TrainTrack.App.boot(); /* DOM already ready */
}
