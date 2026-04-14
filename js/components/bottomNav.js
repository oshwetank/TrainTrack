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
        // Mocking alerts/settings - trigger a toast/alert then reset active class
        alert(view.charAt(0).toUpperCase() + view.slice(1) + ' view coming soon!');
        
        // Push active state back to home
        navItems.forEach(nav => nav.classList.remove('active'));
        const homeNav = Array.from(navItems).find(n => n.dataset.view === 'home');
        if (homeNav) homeNav.classList.add('active');
        
        if (homeContainer) homeContainer.style.display = 'block';
        if (journeyTracker) journeyTracker.style.display = 'none';
      }
    });
  });
}
