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

  // Find trains passing through the station
  let passing = trains.filter(t => {
    const routeArray = t.route || t.stops || [];
    return routeArray.includes(station);
  });

  // Since static schedules often don't have accurate station-level departure times unless we calculate them:
  // For the sake of this prototype, we'll sort based on origin departure time and approximate
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
