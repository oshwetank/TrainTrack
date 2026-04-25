import { escapeHTML } from '../utils/dataUtils.js';

const BOOKMARK_OUTLINE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
const BOOKMARK_FILLED  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;

/**
 * @param {object} train
 * @param {{ onSave?: (from:string, to:string, line:string) => void, isSaved?: boolean }} opts
 */
export function createTrainCard(train, opts = {}) {
  const { onSave, isSaved = false } = opts;

  const tpl = document.createElement('div');
  tpl.className = 'train-card';
  const trainNo = train.trainNo || train.number || train.train_id || '';
  tpl.dataset.trainNumber = escapeHTML(trainNo);
  tpl.dataset.trainId = escapeHTML(trainNo);

  const tName    = escapeHTML(train.name || 'Local Train');
  const tTypeRaw = train.type || 'Local';
  const tType    = escapeHTML(tTypeRaw);
  const route    = train.route || train.stops || [];
  const rawFrom  = train.from || train.origin || route[0] || '';
  const rawTo    = train.to || train.destination || (route.length ? route[route.length - 1] : '') || '';
  const rawLine  = train.line || '';
  const tOrigin  = escapeHTML(rawFrom);
  const tDest    = escapeHTML(rawTo);
  const tTime    = escapeHTML(train.departures?.[0]?.time || train.departureTime || '00:00');
  const tPlatform = escapeHTML(train.departures?.[0]?.platform || train.platform || '-');
  const stopsLen = escapeHTML(String(route.length));

  tpl.innerHTML = `
    <div class="train-header">
      <span class="train-name">${tName}</span>
      <span class="train-type-badge ${escapeHTML(tTypeRaw.toLowerCase())}">${tType}</span>
      <span class="status-container"></span>
      ${onSave ? `<button class="save-btn${isSaved ? ' saved' : ''}" aria-label="${isSaved ? 'Remove saved journey' : 'Save journey'}" title="${isSaved ? 'Saved' : 'Save journey'}">${isSaved ? BOOKMARK_FILLED : BOOKMARK_OUTLINE}</button>` : ''}
    </div>
    <div class="train-route">
      <span class="origin">${tOrigin}</span>
      <span class="arrow">→</span>
      <span class="destination">${tDest}</span>
    </div>
    <div class="train-details">
      <span class="departure-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${tTime}</span>
      <span class="platform">Platform ${tPlatform}</span>
      <span class="stops">${stopsLen} stops</span>
    </div>
  `;

  if (onSave) {
    const btn = tpl.querySelector('.save-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nowSaved = btn.classList.toggle('saved');
      btn.innerHTML = nowSaved ? BOOKMARK_FILLED : BOOKMARK_OUTLINE;
      btn.setAttribute('aria-label', nowSaved ? 'Remove saved journey' : 'Save journey');
      btn.title = nowSaved ? 'Saved' : 'Save journey';
      onSave(rawFrom, rawTo, rawLine, nowSaved);
    });
  }

  tpl.updateStatus = (delayInfo, offline = false) => {
    const sc = tpl.querySelector('.status-container');
    if (!sc) return;
    if (offline) {
      sc.innerHTML = '<span class="offline-badge" title="Live data unavailable">Live N/A</span>';
    } else if (delayInfo) {
      sc.innerHTML = `<span class="${delayInfo.delayed ? 'delay-badge' : 'on-time-badge'}">
        ${delayInfo.delayed ? `Delayed ${delayInfo.delayMinutes}min` : 'On Time'}
      </span>`;
    } else {
      sc.innerHTML = '';
    }
  };

  return tpl;
}
