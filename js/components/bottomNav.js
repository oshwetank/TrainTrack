import { initAlertsView }   from './alertsView.js';
import { initSettingsView } from './settingsView.js';

const VIEWS = {
  home:     () => document.querySelector('.home-container'),
  alerts:   () => document.getElementById('alertsView'),
  settings: () => document.getElementById('settingsView'),
};

let _activeView = 'home';

function hideAll() {
  document.querySelector('.home-container')?.style.setProperty('display', 'none');
  document.getElementById('journeyTracker')?.style.setProperty('display', 'none');
  document.getElementById('alertsView')?.style.setProperty('display', 'none');
  document.getElementById('settingsView')?.style.setProperty('display', 'none');
}

export function initBottomNav() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      const view = item.dataset.view;
      if (view === _activeView) return;
      _activeView = view;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      hideAll();

      if (view === 'home') {
        document.querySelector('.home-container').style.display = 'block';
        return;
      }

      if (view === 'alerts') {
        const el = document.getElementById('alertsView');
        el.style.display = 'block';
        await initAlertsView(el);
        return;
      }

      if (view === 'settings') {
        const el = document.getElementById('settingsView');
        el.style.display = 'block';
        initSettingsView(el);
        return;
      }
    });
  });
}

/* Called by app.js when journey tracker opens/closes */
export function setActiveViewToHome() {
  _activeView = 'home';
  document.querySelectorAll('.bottom-nav .nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === 'home');
  });
}
