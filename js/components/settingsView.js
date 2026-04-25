const LS_CLOCK24  = 'tt_clock24';
const LS_REFRESH  = 'tt_autorefresh';
const WALK_KEY    = 'traintrack_walk_time';
const APP_VERSION = '1.5.0';

function ls_get(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; }
}
function ls_set(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}

export function initSettingsView(container) {
  const clock24   = ls_get(LS_CLOCK24, true);
  const autoref   = ls_get(LS_REFRESH, true);
  const walkTime  = ls_get(WALK_KEY, 10);
  const darkMode  = document.documentElement.dataset.theme === 'dark';

  container.innerHTML = `
    <div class="view-header">
      <h2>Settings</h2>
      <p class="view-subtitle">Personalise your TrainTrack experience</p>
    </div>

    <div class="settings-list">

      <div class="settings-section">
        <h4 class="settings-section-title">Display</h4>

        <label class="setting-row" for="toggle-clock">
          <div class="setting-label">
            <span class="setting-name">24-hour clock</span>
            <span class="setting-desc">Show times in 24 h format</span>
          </div>
          <div class="toggle-switch ${clock24 ? 'on' : ''}" id="toggle-clock" role="switch" aria-checked="${clock24}" tabindex="0"></div>
        </label>

        <label class="setting-row" for="toggle-theme">
          <div class="setting-label">
            <span class="setting-name">Dark mode</span>
            <span class="setting-desc">Switch to dark theme</span>
          </div>
          <div class="toggle-switch ${darkMode ? 'on' : ''}" id="toggle-theme" role="switch" aria-checked="${darkMode}" tabindex="0"></div>
        </label>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">Journey</h4>

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">Walk time to station</span>
            <span class="setting-desc">Used to calculate departure reminders</span>
          </div>
          <div class="walk-time-control">
            <button class="walk-btn" id="walkMinus" aria-label="Decrease walk time">−</button>
            <span class="walk-value" id="walkValue">${walkTime} min</span>
            <button class="walk-btn" id="walkPlus" aria-label="Increase walk time">+</button>
          </div>
        </div>

        <label class="setting-row" for="toggle-autoref">
          <div class="setting-label">
            <span class="setting-name">Auto-refresh live data</span>
            <span class="setting-desc">Poll live train status every 60 s</span>
          </div>
          <div class="toggle-switch ${autoref ? 'on' : ''}" id="toggle-autoref" role="switch" aria-checked="${autoref}" tabindex="0"></div>
        </label>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">About</h4>
        <div class="setting-row no-interact">
          <span class="setting-name">Version</span>
          <span class="setting-value-text">v${APP_VERSION}</span>
        </div>
        <div class="setting-row no-interact">
          <span class="setting-name">Data source</span>
          <span class="setting-value-text">RailRadar + Static schedules</span>
        </div>
        <div class="setting-row no-interact">
          <span class="setting-name">Coverage</span>
          <span class="setting-value-text">Mumbai Local • Metro</span>
        </div>
      </div>

    </div>`;

  /* ── Toggle helpers ── */
  function wireToggle(id, lsKey, onChange) {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener('click', () => {
      const next = !el.classList.contains('on');
      el.classList.toggle('on', next);
      el.setAttribute('aria-checked', String(next));
      ls_set(lsKey, next);
      onChange?.(next);
    });
    el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); } });
  }

  wireToggle('toggle-clock', LS_CLOCK24);
  wireToggle('toggle-autoref', LS_REFRESH);
  wireToggle('toggle-theme', '__theme', (on) => {
    document.documentElement.dataset.theme = on ? 'dark' : 'light';
  });

  /* ── Walk time stepper ── */
  let wt = walkTime;
  const wtEl = container.querySelector('#walkValue');
  container.querySelector('#walkMinus')?.addEventListener('click', () => {
    wt = Math.max(1, wt - 1);
    wtEl.textContent = `${wt} min`;
    ls_set(WALK_KEY, wt);
  });
  container.querySelector('#walkPlus')?.addEventListener('click', () => {
    wt = Math.min(60, wt + 1);
    wtEl.textContent = `${wt} min`;
    ls_set(WALK_KEY, wt);
  });
}
