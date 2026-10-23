const WAZE_BASE_URL = 'https://waze.com/ul';

function validCoordinate(value, min, max) {
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
  const lines = [`Rota: ${route.name}`, route.route_date ? `Data: ${route.route_date}` : '', ''];
  stops.forEach((stop, index) => {
    lines.push(`${index + 1}. ${stop.company_name}`);
    const location = [stop.address, stop.city, stop.state].filter(Boolean).join(', ');
    if (location) lines.push(location);
    lines.push(buildWazeUrl(stop), '');
  });
  lines.push('Abra cada link no Waze ao iniciar o próximo trecho.');
  const message = lines.filter((line, index) => line || lines[index - 1]).join('\n').trim();
  return { message, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}` };
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

