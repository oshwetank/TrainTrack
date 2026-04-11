/**
 * Train Card Component
 */

export function createTrainCard(train) {
  const tpl = document.createElement('div');
  tpl.className = 'train-card';
  tpl.dataset.trainId = train.train_id || train.number || '';
  
  // Provide safe defaults for potentially missing data
  const tName = train.name || 'Local Train';
  const tType = train.type || 'Local';
  const tOrigin = train.from || train.origin || (train.route && train.route[0]) || '';
  const tDest = train.to || train.destination || (train.route && train.route[train.route.length - 1]) || '';
  const tTime = train.departures?.[0]?.time || train.departureTime || '00:00';
  const tPlatform = train.departures?.[0]?.platform || train.platform || '-';
  const stopsLen = train.route ? train.route.length : (train.stops ? train.stops.length : 0);

  // Note: delay info is populated via RailRadar API dynamically by app.js or fetched here.
  // For the initial DOM, we'll assume 'On Time' until proven otherwise, or we can leave it blank and let app.js hydrate.
  tpl.innerHTML = `
    <div class="train-header">
      <span class="train-name">${tName}</span>
      <span class="train-type-badge ${tType.toLowerCase()}">${tType}</span>
      <span class="status-container"></span>
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

  // Provide an easy method to update status from the outside
  tpl.updateStatus = (delayInfo) => {
    const sc = tpl.querySelector('.status-container');
    if (!sc) return;
    
    if (delayInfo) {
      sc.innerHTML = `<span class="${delayInfo.delayed ? 'delay-badge' : 'on-time-badge'}">
        ${delayInfo.delayed ? `Delayed ${delayInfo.delayMinutes}min` : 'On Time'}
      </span>`;
    } else {
      sc.innerHTML = '';
    }
  };

  return tpl;
}
