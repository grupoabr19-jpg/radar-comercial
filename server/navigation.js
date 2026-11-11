const WAZE_BASE_URL = 'https://waze.com/ul';

function validCoordinate(value, min, max) {
  if (value == null || value === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

export function buildWazeUrl(stop) {
  const params = new URLSearchParams({ navigate: 'yes', utm_source: 'radar_comercial' });
  if (validCoordinate(stop.latitude, -90, 90) && validCoordinate(stop.longitude, -180, 180)) {
    params.set('ll', `${Number(stop.latitude)},${Number(stop.longitude)}`);
  } else {
    const query = [stop.address, stop.city, stop.state].filter(Boolean).join(', ');
    if (!query) throw new Error('A parada precisa de coordenadas ou endereço.');
    params.set('q', query);
  }
  return `${WAZE_BASE_URL}?${params.toString()}`;
}

export function buildRouteShare(route, stops) {
  if (!stops.length) throw new Error('A rota não possui paradas.');
  const routeNodes = [
    route.origin_name || route.origin_city || route.origin_latitude != null
      ? { name: route.origin_name || route.origin_city || 'Saída', city: route.origin_city, state: route.origin_state, latitude: route.origin_latitude, longitude: route.origin_longitude }
      : null,
    ...stops,
    route.destination_name || route.destination_city || route.destination_latitude != null
      ? { name: route.destination_name || route.destination_city || 'Destino', city: route.destination_city, state: route.destination_state, latitude: route.destination_latitude, longitude: route.destination_longitude }
      : null,
  ].filter(Boolean);
  const mapLinks = buildGoogleMapsLinks(routeNodes);
  const lines = [`Rota: ${route.name}`, route.route_date ? `Data: ${route.route_date}` : '', ''];
  if (route.origin_name || route.origin_city) lines.push(`Saída: ${route.origin_name || route.origin_city}`);
  stops.forEach((stop, index) => {
    lines.push(`${index + 1}. ${stop.company_name}`);
    const location = [stop.address, stop.city, stop.state].filter(Boolean).join(', ');
    if (location) lines.push(location);
    lines.push('');
  });
  if (route.destination_name || route.destination_city) lines.push(`Chegada: ${route.destination_name || route.destination_city}`);
  if (mapLinks.length) {
    lines.push('', mapLinks.length === 1 ? 'Navegar pela rota no Google Maps:' : 'Navegar por trechos no Google Maps:');
    mapLinks.forEach((link, index) => lines.push(mapLinks.length === 1 ? link : `Trecho ${index + 1}: ${link}`));
  } else {
    lines.push('', 'Links do Waze por parada:');
    stops.forEach((stop, index) => lines.push(`${index + 1}. ${buildWazeUrl(stop)}`));
  }
  const message = lines.filter((line, index) => line || lines[index - 1]).join('\n').trim();
  return { message, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}` };
}

function routeLocation(item) {
  if (validCoordinate(item.latitude, -90, 90) && validCoordinate(item.longitude, -180, 180)) {
    return `${Number(item.latitude)},${Number(item.longitude)}`;
  }
  return [item.address, item.city, item.state].filter(Boolean).join(', ');
}

function buildGoogleMapsLinks(nodes) {
  if (nodes.length < 2) return [];
  const locations = nodes.map(routeLocation);
  if (locations.some((location) => !location)) return [];
  const links = [];
  let start = 0;
  while (start < locations.length - 1) {
    const end = Math.min(start + 4, locations.length - 1);
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', locations[start]);
    url.searchParams.set('destination', locations[end]);
    url.searchParams.set('travelmode', 'driving');
    const waypoints = locations.slice(start + 1, end);
    if (waypoints.length) url.searchParams.set('waypoints', waypoints.join('|'));
    links.push(url.toString());
    start = end;
  }
  return links;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const [aLat, aLon, bLat, bLon] = values.map(toRadians);
  const deltaLat = bLat - aLat;
  const deltaLon = bLon - aLon;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function distanceToRouteKm(point, origin, destination) {
  if (![point, origin, destination].every((item) =>
    validCoordinate(item?.latitude, -90, 90) && validCoordinate(item?.longitude, -180, 180))) return null;
  const values = [point, origin, destination].flatMap((item) => [Number(item.latitude), Number(item.longitude)]);
  if (!values.every(Number.isFinite)) return null;
  const [lat, lon, originLat, originLon, destinationLat, destinationLon] = values;
  const latitudeScale = 111.195;
  const longitudeScale = latitudeScale * Math.cos(((originLat + destinationLat) / 2) * Math.PI / 180);
  const endX = (destinationLon - originLon) * longitudeScale;
  const endY = (destinationLat - originLat) * latitudeScale;
  const pointX = (lon - originLon) * longitudeScale;
  const pointY = (lat - originLat) * latitudeScale;
  const lengthSquared = endX ** 2 + endY ** 2;
  const progress = lengthSquared ? Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / lengthSquared)) : 0;
  const nearest = {
    latitude: originLat + (destinationLat - originLat) * progress,
    longitude: originLon + (destinationLon - originLon) * progress,
  };
  return {
    distanceKm: haversineKm(lat, lon, nearest.latitude, nearest.longitude),
    alongRouteKm: progress * haversineKm(originLat, originLon, destinationLat, destinationLon),
  };
}

export function orderStopsByProximity(stops, origin, destination) {
  const located = stops.filter((stop) => validCoordinate(stop.latitude, -90, 90)
    && validCoordinate(stop.longitude, -180, 180));
  const unlocated = stops.filter((stop) => !located.includes(stop));
  const ordered = [];
  const hasOrigin = origin && validCoordinate(origin.latitude, -90, 90)
    && validCoordinate(origin.longitude, -180, 180);
  let current = hasOrigin ? origin : located.shift();
  if (!hasOrigin && current) ordered.push(current);
  while (located.length) {
    located.sort((left, right) => {
      const routeCost = (stop) => haversineKm(current.latitude, current.longitude, stop.latitude, stop.longitude)
        + (destination && validCoordinate(destination.latitude, -90, 90)
          && validCoordinate(destination.longitude, -180, 180)
          ? haversineKm(stop.latitude, stop.longitude, destination.latitude, destination.longitude) * 0.15
          : 0);
      const distance = routeCost(left) - routeCost(right);
      if (distance) return distance;
      if (left.kind !== right.kind) return left.kind === 'prospect' ? -1 : 1;
      return String(left.name || left.company_name).localeCompare(String(right.name || right.company_name));
    });
    current = located.shift();
    ordered.push(current);
  }
  return [...ordered, ...unlocated];
}
