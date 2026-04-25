import { escapeHTML } from '../utils/dataUtils.js';

const SEV_LABEL = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
const SEV_CLASS = { high: 'sev-high', medium: 'sev-medium', low: 'sev-low', info: 'sev-info' };

let _disruptions = null;

async function loadDisruptions() {
  if (_disruptions) return _disruptions;
  try {
    const res = await fetch('./disruptions.json', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _disruptions = await res.json();
  } catch {
    _disruptions = { disruptions: [] };
  }
  return _disruptions;
}

export async function initAlertsView(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>Service Alerts</h2>
      <p class="view-subtitle">Active disruptions and mega-block schedule</p>
    </div>
    <div class="alerts-list" id="alertsList">
      <div class="loading-state"><div class="spinner"></div><p>Loading alerts…</p></div>
    </div>`;

  const data = await loadDisruptions();
  const list  = container.querySelector('#alertsList');
  const items = data.disruptions ?? [];

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">✅</span>
        <p>No active disruptions.</p>
        <p class="empty-hint">All lines running normally.</p>
      </div>`;
    return;
  }

  list.innerHTML = items.map(d => {
    const sev    = (d.severity || 'info').toLowerCase();
    const status = d.status === 'active' ? 'ACTIVE' : d.status === 'scheduled' ? 'SCHEDULED' : escapeHTML(d.status ?? '');
    const line   = escapeHTML((d.line ?? '').replace('_', '-'));
    return `
      <div class="alert-card ${SEV_CLASS[sev] ?? 'sev-info'}">
        <div class="alert-header">
          <div class="alert-meta">
            <span class="alert-line-tag">${line}</span>
            <span class="alert-status">${status}</span>
          </div>
          <span class="alert-sev-badge ${SEV_CLASS[sev] ?? 'sev-info'}">${SEV_LABEL[sev] ?? 'Info'}</span>
        </div>
        <h3 class="alert-title">${escapeHTML(d.title ?? 'Service Alert')}</h3>
        <p class="alert-message">${escapeHTML(d.message ?? '')}</p>
        ${d.affectedStations?.length ? `<p class="alert-stations">Affected: ${d.affectedStations.map(escapeHTML).join(', ')}</p>` : ''}
      </div>`;
  }).join('');
}
