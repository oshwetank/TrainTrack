/**
 * Journey Tracker Component
 */

let currentTrain = null;
let currentTrackingInterval = null;

export function initJourneyTracker(train, backCallback) {
  const container = document.getElementById('journeyTracker');
  if (!container) return;
  
  currentTrain = train;
  
  // Create UI skeleton
  container.innerHTML = `
    <div class="tracker-header">
      <button class="back-btn" id="btnBackToHome">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        Back
      </button>
      <div class="tracker-title">
        <h2>${train.from || train.origin || 'Origin'} to ${train.to || train.destination || 'Destination'}</h2>
        <span class="train-type-badge ${train.type ? train.type.toLowerCase() : ''}">${train.type || 'Local'}</span>
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
  
  renderJourneyTimeline(train);
}

export function renderJourneyTimeline(train, currentStationIdx = 1) { // Mock 1 station advanced
  const container = document.getElementById('timelineStops');
  if (!container || !train) return;
  
  const stops = train.route || train.stops || [];
  if (stops.length === 0) {
    container.innerHTML = '<p>No route information available.</p>';
    return;
  }
  
  let html = '';
  
  stops.forEach((stop, idx) => {
    let classes = ['stop-item'];
    
    // For prototyping: mark completed/active based on mocked idx
    if (idx < currentStationIdx) {
      classes.push('completed');
    } else if (idx === currentStationIdx) {
      classes.push('active');
    }
    
    html += `
      <div class="${classes.join(' ')}">
        <span class="stop-name">${stop}</span>
        <span class="stop-platform">Pf. 1</span> <!-- Mocking Pf 1 for stops -->
        ${idx === currentStationIdx ? '<div class="in-transit-indicator">IN TRANSIT</div>' : ''}
      </div>
    `;
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
