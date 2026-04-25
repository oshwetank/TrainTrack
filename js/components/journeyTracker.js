/**
 * Journey Tracker Component
 */

import { escapeHTML } from '../utils/dataUtils.js';

let currentTrain = null;
let currentTrackingInterval = null;

export function stopJourneyTracking() {
  if (currentTrackingInterval) { clearInterval(currentTrackingInterval); currentTrackingInterval = null; }
  currentTrain = null;
}

export function initJourneyTracker(train, backCallback) {
  const container = document.getElementById('journeyTracker');
  if (!container) return;
  
  currentTrain = train;
  
  const fromStr = escapeHTML(train.from || train.origin || 'Origin');
  const toStr = escapeHTML(train.to || train.destination || 'Destination');
  const typeStr = escapeHTML(train.type || 'Local');
  const typeClass = escapeHTML(train.type ? train.type.toLowerCase() : '');

  // Create UI skeleton
  container.innerHTML = `
    <div class="tracker-header">
      <button class="back-btn" id="btnBackToHome">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        Back
      </button>
      <div class="tracker-title">
        <h2>${fromStr} to ${toStr}</h2>
        <span class="train-type-badge ${typeClass}">${typeStr}</span>
      </div>
    </div>
    
    <div class="eta-display" id="etaDisplay">
      <div class="eta-label">Estimated Arrival</div>
      <div class="eta-time">--:--</div>
      <div class="status-container" style="margin-top: 8px;"></div>
    </div>
    
    <div class="journey-timeline">
      <h3>Journey Stops</h3>
      <div class="timeline-stops" id="timelineStops">
        <!-- Rendered by renderJourneyTimeline -->
      </div>
    </div>
    
    <div class="safety-updates">
      <h3>Safety & Updates</h3>
      <button class="btn btn-secondary btn-notify">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        Notify Family
      </button>
      <button class="btn btn-secondary btn-sos">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        SOS Assistance
      </button>
    </div>
  `;

  document.getElementById('btnBackToHome').addEventListener('click', () => {
    if (backCallback) backCallback();
  });

  /* SOS — call RPF emergency line (182) */
  const sosBtn = container.querySelector('.btn-sos');
  if (sosBtn) {
    sosBtn.addEventListener('click', () => {
      window.location.href = 'tel:182';
    });
  }

  /* Notify Family — pre-filled WhatsApp message with train info */
  const notifyBtn = container.querySelector('.btn-notify');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      const route = train.route || train.stops || [];
      const dest  = train.to || (route.length ? route[route.length - 1] : 'my destination');
      const name  = train.name || 'a Local Train';
      const msg   = encodeURIComponent(
        `I'm on ${name} heading to ${dest}. Tracking my journey via TrainTrack. 🚆`
      );
      window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
    });
  }

  renderJourneyTimeline(train);

  /* Refresh timeline every 60s so current-stop advances automatically */
  if (currentTrackingInterval) clearInterval(currentTrackingInterval);
  currentTrackingInterval = setInterval(() => renderJourneyTimeline(train), 60_000);
}

export function renderJourneyTimeline(train) {
  const container = document.getElementById('timelineStops');
  if (!container || !train) return;

  const stops = train.route || train.stops || [];
  if (stops.length === 0) {
    container.innerHTML = '<p class="empty-hint">No route information available.</p>';
    return;
  }

  /* Build a lookup: stationCode → { time, platform } from train.departures */
  const depMap = {};
  (train.departures || []).forEach(d => {
    if (d.station) depMap[d.station] = { time: d.time || '', platform: d.platform || '—' };
  });

  /* Determine current position by time */
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  let currentIdx = 0;
  stops.forEach((code, idx) => {
    const dep = depMap[code];
    if (!dep?.time) return;
    const [h, m] = dep.time.split(':').map(Number);
    if (!isNaN(h) && (h * 60 + m) <= nowMins) currentIdx = idx;
  });

  let html = '';
  stops.forEach((code, idx) => {
    const dep = depMap[code] ?? {};
    const isPast   = idx < currentIdx;
    const isCurrent = idx === currentIdx;
    const cls = isPast ? 'stop-item completed' : isCurrent ? 'stop-item active' : 'stop-item';

    html += `
      <div class="${cls}">
        <div class="stop-dot"></div>
        <div class="stop-info">
          <span class="stop-name">${escapeHTML(String(code))}</span>
          ${dep.time ? `<span class="stop-time">${escapeHTML(dep.time)}</span>` : ''}
        </div>
        <span class="stop-platform">${dep.platform ? `Pf ${escapeHTML(String(dep.platform))}` : ''}</span>
        ${isCurrent ? '<div class="in-transit-indicator">NOW</div>' : ''}
      </div>`;
  });

  container.innerHTML = html;
}

export function updateETA(eta, delayInfo) {
  const etaDisplay = document.getElementById('etaDisplay');
  if (!etaDisplay) return;
  
  const timeEl = etaDisplay.querySelector('.eta-time');
  const statusEl = etaDisplay.querySelector('.status-container');
  
  if (timeEl) timeEl.textContent = eta || '--:--';
  
  if (delayInfo) {
    if (delayInfo.delayed) etaDisplay.classList.add('delayed');
    else etaDisplay.classList.remove('delayed');
    
    if (statusEl) {
      statusEl.innerHTML = `<span class="${delayInfo.delayed ? 'delay-badge' : 'on-time-badge'}">
        ${delayInfo.delayed ? `Delayed ${delayInfo.delayMinutes}min` : 'On Time'}
      </span>`;
    }
  }
}
