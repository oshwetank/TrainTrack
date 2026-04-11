const fs = require('fs');
let code = fs.readFileSync('js/app.js', 'utf8');

const imports = `import { createTrainCard } from './components/trainCard.js';
import { initJourneyTracker, updateETA } from './components/journeyTracker.js';
import { initBottomNav } from './components/bottomNav.js';
import { getGreeting, calculateCountdown, calculateETA, getNextDepartures } from './utils/timeUtils.js';
import { filterTrainsByRoute } from './utils/dataUtils.js';

`;

// Since it's easier, we'll replace the entire UI and App module contents
// using regex. We know where UI starts and App ends roughly, but maybe easier
// just to wipe the bottom half and re-write. Where does UI start?
const uiIndex = code.indexOf('const UI = (() => {');
if (uiIndex !== -1) {
    // We keep everything before UI (Config, Store, API, Search)
    const newCode = imports + code.substring(0, uiIndex) + 
`
  // Initialize Amber Dawn UI
  const App = (() => {
    let _scheduleData = null;
    let _activeTrainPoll = null;

    async function boot() {
      console.log('Booting Amber Dawn UI...');
      
      initBottomNav();
      
      const greetingEl = document.getElementById('greeting');
      if(greetingEl) greetingEl.textContent = getGreeting() + ', Traveler';

      try {
        const cached = await Store.getCachedSchedules();
        if (cached) {
          _scheduleData = cached;
          _renderHome();
        }

        const { data: freshData } = await API.loadSchedules();
        _scheduleData = freshData;
        await Store.cacheSchedules(freshData);
        if (!cached) _renderHome();

      } catch (e) {
        console.error('Failed to load schedules', e);
      }
      
      setInterval(_updateCountdowns, 60000);
      
      window.addEventListener('online', () => {
         console.log("Back online!");
         _renderHome(); // Fetch live data
      });
    }
    
    function _renderHome() {
      const trains = _scheduleData.trains?.western || [];
      const list = document.getElementById('trainList');
      if (!list) return;
      
      list.innerHTML = '';
      const upcoming = trains.slice(0, 5);
      upcoming.forEach(t => {
        const card = createTrainCard(t);
        card.addEventListener('click', () => {
           const hc = document.querySelector('.home-container');
           const jt = document.getElementById('journeyTracker');
           if (hc) hc.style.display = 'none';
           if (jt) jt.style.display = 'block';
           initJourneyTracker(t, () => {
              if (hc) hc.style.display = 'block';
              if (jt) jt.style.display = 'none';
              if(_activeTrainPoll) clearInterval(_activeTrainPoll);
           });
           
           updateETA(calculateETA(t.stops[0], t.stops[t.stops.length-1], t));
        });
        list.appendChild(card);
        
        API.fetchTrainLive(t.trainNo || t.number, new AbortController().signal)
          .then(res => {
            const delayInfo = res.data ? { delayed: res.data.delay > 0, delayMinutes: res.data.delay } : null;
            card.updateStatus(delayInfo);
          }).catch(() => {
             // Mock data if CORS block or offline
             card.updateStatus(null);
          });
      });
      
      const hero = document.getElementById('nextTrainCard');
      if (hero && upcoming.length > 0) {
        const next = upcoming[0];
        hero.innerHTML = \`
          <div class="route-info">
            <h2>\${next.from || next.stops[0]} to \${next.to || next.stops[next.stops.length-1]}</h2>
            <span class="train-type">\${next.type}</span>
          </div>
          <div class="departure-info">
            <div class="countdown">
              <span class="time" id="hero-countdown">\${calculateCountdown(next.departure?.time || '00:00')}</span>
              <span class="unit">MINUTES</span>
            </div>
            <div class="platform">Platform \${next.departure?.platform || 1}</div>
          </div>
          <button class="cta-button" onclick="document.getElementById('journeyTracker').style.display='block'; document.querySelector('.home-container').style.display='none';">Leave Now!</button>\`;
      }
    }
    
    function _updateCountdowns() {
      _renderHome();
    }

    return { boot, getScheduleData: () => _scheduleData };
  })();

  return { Config, Store, API, Search, App };
})();

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TrainTrack.App.boot());
} else {
  TrainTrack.App.boot();
}

// Global exposure
window.TrainTrack = TrainTrack;
export const { Config, Store, API, Search } = TrainTrack;
`;

    fs.writeFileSync('js/app.js', newCode);
    console.log('Successfully refactored app.js');
} else {
    console.error('Could not find UI module starting point');
}
