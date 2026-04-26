import { initAlertsView }   from './alertsView.js';
import { initSettingsView } from './settingsView.js';

const VIEWS = ['home', 'alerts', 'settings'];
let _activeView = 'home';

function _getEl(view) {
  if (view === 'home') return document.querySelector('.home-container');
  return document.getElementById(view === 'alerts' ? 'alertsView' : 'settingsView');
}

function _hideAll() {
  const home = document.querySelector('.home-container');
  if (home) home.style.display = 'none';
  ['journeyTracker', 'alertsView', 'settingsView'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('view-active');
  });
}

function _show(el) {
  el.style.display = 'block';
  /* Double rAF: ensures element is in the render tree at opacity:0 before transition */
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('view-active')));
}

function _hide(el) {
  if (!el) return;
  el.classList.remove('view-active');
}

export function initBottomNav() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');

  /* Apply base transition class to all views */
  ['alertsView', 'settingsView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('view-transition');
  });

  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      const view = item.dataset.view;
      if (view === _activeView) return;
      _activeView = view;

      /* Update aria-current and active class */
      navItems.forEach(n => {
        n.classList.remove('active');
        n.removeAttribute('aria-current');
      });
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');

      /* Hide current, show target */
      _hideAll();

      if (view === 'home') {
        const el = document.querySelector('.home-container');
        _show(el);
        return;
      }

      if (view === 'alerts') {
        const el = document.getElementById('alertsView');
        _show(el);
        await initAlertsView(el);
        return;
      }

      if (view === 'settings') {
        const el = document.getElementById('settingsView');
        _show(el);
        initSettingsView(el);
        return;
      }
    });
  });
}

export function setActiveViewToHome() {
  _activeView = 'home';
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(n => {
    const isHome = n.dataset.view === 'home';
    n.classList.toggle('active', isHome);
    if (isHome) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });
}
