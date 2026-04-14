/**
 * Data utilities for train filtering and route manipulation
 */

export function filterTrainsByRoute(trains, origin, destination) {
  if (!trains || !Array.isArray(trains)) return [];
  
  return trains.filter(t => {
    if (!origin && !destination) return true;
    
    // Fall back to stops if route is unavailable
    const routeArray = t.route || t.stops;
    
    if (origin && !destination) return routeArray.includes(origin);
    if (!origin && destination) return routeArray.includes(destination);
    
    const fromIndex = routeArray.indexOf(origin);
    const toIndex = routeArray.indexOf(destination);
    
    return fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex;
  });
}

export function sortTrainsByDeparture(trains) {
  return [...trains].sort((a, b) => {
    const timeA = a.departure?.time || a.departureTime || a.departures?.[0]?.time || "23:59";
    const timeB = b.departure?.time || b.departureTime || b.departures?.[0]?.time || "23:59";
    return timeA.localeCompare(timeB);
  });
}

export function getNextDepartures(trains, station, limit = 5) {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const windowEnd   = currentMins + 120; // 2-hour forward window

  // Find trains passing through the station that depart within the next 2 hours
  let passing = trains.filter(t => {
    const routeArray = t.route || t.stops || [];
    if (!routeArray.includes(station)) return false;

    // Extract origin departure time (HH:MM format)
    const timeStr = t.departures?.[0]?.time || t.departureTime || t.departure?.time;
    if (!timeStr) return true; // Include if no time data — don't exclude unknown trains

    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return true;

    const depMins = h * 60 + m;

    // Handle midnight crossing (windowEnd > 1440)
    if (windowEnd > 1440) {
      return depMins >= currentMins || depMins <= (windowEnd - 1440);
    }
    return depMins >= currentMins && depMins <= windowEnd;
  });

  passing = sortTrainsByDeparture(passing);
  return passing.slice(0, limit);
}

export function calculateJourneyProgress(train, currentStation) {
  if (!train) return 0;

  const route = train.route || train.stops || [];
  if (!route.length) return 0;
  
  const totalStops = route.length;
  if (totalStops <= 1) return 0;
  
  const currentIndex = route.indexOf(currentStation);
  if (currentIndex === -1) return 0;
  
  return (currentIndex / (totalStops - 1)) * 100;
}
