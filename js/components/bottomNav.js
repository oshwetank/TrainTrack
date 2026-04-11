/**
 * Bottom Nav Component
 */

export function initBottomNav() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  const homeContainer = document.querySelector('.home-container');
  const journeyTracker = document.getElementById('journeyTracker');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      const view = item.dataset.view;
      
      // Simple routing
      if (view === 'home') {
        if (homeContainer) homeContainer.style.display = 'block';
        if (journeyTracker) journeyTracker.style.display = 'none';
      } else {
        // Mocking alerts/settings - just hide everything and reset later, or just toggle active classes
        // For phase 1, we just return to home if clicked
        if (homeContainer) homeContainer.style.display = 'block';
        if (journeyTracker) journeyTracker.style.display = 'none';
      }
    });
  });
}
