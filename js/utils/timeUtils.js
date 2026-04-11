/**
 * Time utilities for greetings, countdowns, and ETA calculations
 */

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function calculateCountdown(departureTime) {
  // departureTime format: "HH:MM" or Date object
  const now = new Date();
  const departure = typeof departureTime === 'string' 
    ? parseTimeString(departureTime)
    : departureTime;
  
  const diff = departure - now;
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 0) return 'Departed';
  if (minutes === 0) return 'Departing now';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export function parseTimeString(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function formatTime(date) {
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

export function calculateETA(currentStation, destinationStation, train) {
  // Calculate ETA based on train schedule and current position
  // Placeholder implementation for real-time calculation
  if (!train || !train.route) return '--:--';
  
  // Simple heuristic: 3 mins per station
  const cIdx = train.route.indexOf(currentStation);
  const dIdx = train.route.indexOf(destinationStation);
  
  if(cIdx !== -1 && dIdx !== -1 && dIdx > cIdx) {
    const stopsLeft = dIdx - cIdx;
    const now = new Date();
    now.setMinutes(now.getMinutes() + (stopsLeft * 3));
    return formatTime(now);
  }
  return '--:--';
}
