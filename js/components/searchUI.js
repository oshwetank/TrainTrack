import { escapeHTML } from '../utils/dataUtils.js';

/**
 * Search UI Component
 * Handles the display and logic of the Station Search modal.
 */

const RECENT_KEY   = 'tt_recent_searches';
const RECENT_LIMIT = 5;

function _getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; }
  catch { return []; }
}

function _addRecent(station) {
  const recent = _getRecent().filter(s => !(s.code === station.code && s.line === station.line));
  recent.unshift({ code: station.code, name: station.name, line: station.line });
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, RECENT_LIMIT))); }
  catch {}
}

export function initSearch(App, Store, SearchModule) {
  const btnHeaderSearch = document.getElementById('btnHeaderSearch');
  const searchContainer = document.getElementById('searchContainer');
  const btnSearchBack = document.getElementById('btnSearchBack');
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const searchResults = document.getElementById('searchResults');
  const homeContainer = document.querySelector('.home-container');
  const journeyTracker = document.getElementById('journeyTracker');

  if (!btnHeaderSearch || !searchContainer) return;

  function openSearch() {
    searchContainer.style.display = 'flex';
    homeContainer.style.display = 'none';
    if (journeyTracker) journeyTracker.style.display = 'none';
    searchInput.setAttribute('aria-expanded', 'true');
    setTimeout(() => searchInput.focus(), 50);
    renderResults(searchInput.value);
  }

  function closeSearch() {
    searchContainer.style.display = 'none';
    homeContainer.style.display = 'block';
    searchInput.setAttribute('aria-expanded', 'false');
  }

  function clearSearch() {
    searchInput.value = '';
    searchInput.focus();
    btnClearSearch.style.display = 'none';
    renderResults('');
  }

  function handleStationSelect(station) {
    _addRecent(station);
    Store.savePrefs({ from: station.code, line: station.line });
    closeSearch();
    window.dispatchEvent(new CustomEvent('traintrack:station-changed'));
  }

  function _buildResultItem(station, isRecent = false) {
    const el = document.createElement('div');
    el.className = `search-result-item${isRecent ? ' search-result-recent' : ''}`;
    el.dataset.line = escapeHTML(station.line);
    const lineInitial = station.line === 'trans_harbour' ? 'T' : station.line.charAt(0).toUpperCase();
    el.innerHTML = `
      <div class="search-result-icon">${lineInitial}</div>
      <div class="search-result-details">
        <span class="search-result-name">${escapeHTML(station.name)}</span>
        <span class="search-result-line">${escapeHTML(station.line.replace(/_/g, '-'))} Line</span>
      </div>`;
    el.addEventListener('click', () => handleStationSelect(station));
    return el;
  }

  function renderResults(query) {
    searchResults.innerHTML = '';

    if (!query || query.length === 0) {
      const recent = _getRecent();
      if (recent.length === 0) {
        searchResults.innerHTML = `
          <div class="search-placeholder">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <p>Type to search stations</p>
          </div>`;
        return;
      }
      recent.forEach(s => searchResults.appendChild(_buildResultItem(s, true)));
      return;
    }

    const results = SearchModule.query(query);
    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-placeholder">
          <span class="search-icon" aria-hidden="true">🚫</span>
          <p>No stations found for "${escapeHTML(query)}"</p>
        </div>`;
      return;
    }

    results.forEach(s => searchResults.appendChild(_buildResultItem(s, false)));
  }

  // Event Listeners
  btnHeaderSearch.addEventListener('click', openSearch);
  btnSearchBack.addEventListener('click', closeSearch);
  btnClearSearch.addEventListener('click', clearSearch);

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    btnClearSearch.style.display = val.length > 0 ? 'block' : 'none';
    renderResults(val);
  });
}
