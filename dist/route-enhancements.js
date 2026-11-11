let app;
let routeSuggestions = [];
let candidateSearchResults = [];
let segmentData = { taxonomy: [], mappings: [] };
let searchTimer;
let searchRequest = 0;

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const validPoint = (item) => item?.latitude != null && item.latitude !== ''
  && item?.longitude != null && item.longitude !== ''
  && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
const stateName = (prefix) => $(`#${prefix}State`).value.trim().toUpperCase();

function routeBuilderMarkup() {
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `<article id="routeBuilder" class="panel route-builder">
    <div class="panel-header"><div><span class="eyebrow">TRAJETO E PARADAS</span><h2>Defina saída e destino</h2></div></div>
    <p class="route-builder-help">Informe cidade e UF. As coordenadas usam o centro do município e servem para estimar proximidade, não o caminho real das ruas.</p>
    <div class="route-endpoints">
      <label>Ponto de saída (A)<input id="routeOriginCity" autocomplete="address-level2" placeholder="Ex.: Campinas" required></label>
      <label>UF<input id="routeOriginState" maxlength="2" placeholder="SP" required></label>
      <label>Ponto final (B)<input id="routeDestinationCity" autocomplete="address-level2" placeholder="Ex.: Jundiaí" required></label>
      <label>UF<input id="routeDestinationState" maxlength="2" placeholder="SP" required></label>
    </div>
    <div class="route-builder-controls">
      <label>Nome da rota<input id="routeName" value="Rota ${localDate}"></label>
      <label>Data<input id="routeDate" type="date" value="${localDate}"></label>
      <label>Faixa do trajeto (km)<input id="routeCorridorKm" type="number" min="1" max="50" value="15"></label>
      <label>Máximo de sugestões<input id="routeMaxStops" type="number" min="1" max="50" value="20"></label>
      <button class="primary-button" type="button" data-route-action="suggest">Sugerir paradas no trajeto</button>
    </div>
    <div id="routeSuggestionStatus" class="route-builder-help" aria-live="polite"></div>
    <div id="routeSuggestions" class="route-suggestions"></div>
    <div class="route-candidate-search">
      <label for="routeCandidateSearch">Adicionar cliente ou prospect manualmente</label>
      <input id="routeCandidateSearch" autocomplete="off" placeholder="Pesquise por empresa, cidade ou CNPJ">
      <div id="routeCandidateResults" class="route-suggestions"></div>
    </div>
    <div class="route-builder-footer">
      <button class="secondary-button" type="button" data-route-action="optimize">Reordenar por proximidade</button>
      <button class="primary-button" type="button" data-route-action="save">Salvar rota</button>
    </div>
  </article>`;
}

function mount() {
  if (!app || $('#routeBuilder')) return;
  const regionExplorer = $('#routesView .region-explorer');
  if (!regionExplorer) return;
  regionExplorer.insertAdjacentHTML('afterend', routeBuilderMarkup());
  const section = $('.nav-section');
  if (section) section.insertAdjacentHTML('beforeend', '<button class="nav-item" data-feature-action="open-segments"><svg><use href="#icon-sliders"></use></svg><span>Segmentos e CNAEs</span></button>');
  restoreEndpoints();
}

function endpointFromInputs(prefix) {
  const city = $(`#${prefix}City`).value.trim();
  const stateCode = stateName(prefix);
  if (!city || !/^[A-Z]{2}$/.test(stateCode)) throw new Error(`Informe cidade e UF válidas para o ponto ${prefix === 'routeOrigin' ? 'A' : 'B'}.`);
  return { name: city, city, state: stateCode };
}

function saveEndpoints() {
  localStorage.setItem('radar-route-endpoints', JSON.stringify({
    origin: app.state.routeOrigin,
    destination: app.state.routeDestination,
  }));
}

function restoreEndpoints() {
  try {
    const saved = JSON.parse(localStorage.getItem('radar-route-endpoints') || '{}');
    app.state.routeOrigin = saved.origin || null;
    app.state.routeDestination = saved.destination || null;
    if (saved.origin) {
      $('#routeOriginCity').value = saved.origin.city || '';
      $('#routeOriginState').value = saved.origin.state || '';
    }
    if (saved.destination) {
      $('#routeDestinationCity').value = saved.destination.city || '';
      $('#routeDestinationState').value = saved.destination.state || '';
    }
  } catch (error) {
    console.error('Não foi possível restaurar os pontos da rota:', error);
    localStorage.removeItem('radar-route-endpoints');
  }
}

function routeStop(candidate) {
  return {
    ...candidate,
    id: candidate.id || `${candidate.kind}-${candidate.entityId}`,
    name: candidate.name || candidate.companyName,
    companyName: candidate.companyName || candidate.name,
    cityName: candidate.city || '',
    latitude: candidate.latitude == null ? null : Number(candidate.latitude),
    longitude: candidate.longitude == null ? null : Number(candidate.longitude),
  };
}

function hasStop(candidate) {
  return app.state.routeStops.some((stop) =>
    (candidate.customerId && stop.customerId === candidate.customerId)
    || (candidate.prospectId && stop.prospectId === candidate.prospectId));
}

function addCandidate(candidate) {
  if (hasStop(candidate)) return;
  if (app.state.routeStops.length >= 50) {
    app.showToast('Uma rota pode ter no máximo 50 paradas.');
    return;
  }
  app.state.routeStops.push(routeStop(candidate));
  app.renderRoute();
  renderSuggestions();
  renderCandidateSearchResults();
}

function renderCandidate(candidate, index, alreadyAdded) {
  const kindLabel = candidate.kind === 'prospect'
    ? 'PROSPECT / NOVO CLIENTE'
    : candidate.portfolioStatus === 'inactive' ? 'CLIENTE INATIVO' : 'CLIENTE';
  return `<article class="route-suggestion">
    <div><strong>${index == null ? '' : `${index + 1}. `}${escapeHtml(candidate.name)}</strong>
      <p>${escapeHtml([candidate.address, candidate.city, candidate.state].filter(Boolean).join(' · ') || 'Endereço não informado')}</p>
      <small>${escapeHtml([candidate.macroSegment, candidate.microSegment].filter(Boolean).join(' · ') || 'Segmento não classificado')} · ${kindLabel}</small>
      ${candidate.distanceFromRouteKm == null ? '' : `<small> ${candidate.distanceFromRouteKm} km do eixo</small>`}
    </div>
    <button class="secondary-button" type="button" data-route-action="add-candidate" data-candidate-id="${escapeHtml(candidate.id)}" ${alreadyAdded ? 'disabled' : ''}>${alreadyAdded ? 'Adicionado' : 'Adicionar à rota'}</button>
  </article>`;
}

function renderSuggestions() {
  const container = $('#routeSuggestions');
  if (!container) return;
  const selected = routeSuggestions.filter(hasStop).length;
  $('#routeSuggestionStatus').textContent = routeSuggestions.length
    ? `${selected} de ${routeSuggestions.length} sugestões estão na rota. Prospects aparecem antes de clientes inativos.`
    : 'As sugestões são calculadas por distância geográfica aproximada ao segmento A–B.';
  container.innerHTML = routeSuggestions.map((candidate, index) =>
    renderCandidate(candidate, index, hasStop(candidate))).join('');
}

async function suggestStops(button) {
  const origin = endpointFromInputs('routeOrigin');
  const destination = endpointFromInputs('routeDestination');
  const corridorKm = Number($('#routeCorridorKm').value);
  const maxStops = Number($('#routeMaxStops').value);
  button.disabled = true;
  try {
    const result = await app.api('/api/routes/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, corridorKm, maxStops }),
    });
    app.state.routeOrigin = result.origin;
    app.state.routeDestination = result.destination;
    saveEndpoints();
    routeSuggestions = result.suggestions.map(routeStop);
    const merged = new Map(app.state.routeStops.map((stop) => [stop.id, stop]));
    for (const candidate of routeSuggestions) {
      if (merged.size >= 50) break;
      if (!hasStop(candidate)) merged.set(candidate.id, candidate);
    }
    app.state.routeStops = [...merged.values()];
    app.renderRoute();
    renderSuggestions();
    app.showToast(`${routeSuggestions.length} paradas sugeridas no trajeto.`);
  } catch (error) {
    app.showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function optimizeStops() {
  const stops = [...app.state.routeStops];
  const located = stops.filter(validPoint);
  const unlocated = stops.filter((stop) => !validPoint(stop));
  if (located.length < 2) {
    app.showToast('São necessárias ao menos duas paradas geolocalizadas.');
    return;
  }
  const origin = validPoint(app.state.routeOrigin) ? app.state.routeOrigin : located.shift();
  const ordered = [];
  let current = origin;
  while (located.length) {
    located.sort((left, right) => {
      const score = (stop) => app.distanceKm(current, stop)
        + (validPoint(app.state.routeDestination) ? app.distanceKm(stop, app.state.routeDestination) * 0.15 : 0);
      const delta = score(left) - score(right);
      return delta || (left.kind === 'prospect' ? -1 : 1);
    });
    current = located.shift();
    ordered.push(current);
  }
  app.state.routeStops = [...ordered, ...unlocated];
  app.renderRoute();
  app.showToast('Paradas reordenadas por proximidade; o trajeto é estimado em linha geográfica.');
}

function mapLocation(item) {
  if (validPoint(item)) return `${Number(item.latitude)},${Number(item.longitude)}`;
  return [item.address, item.city || item.cityName, item.state].filter(Boolean).join(', ');
}

function googleMapsLinks() {
  const nodes = [
    ...(validPoint(app.state.routeOrigin) ? [app.state.routeOrigin] : []),
    ...app.state.routeStops,
    ...(validPoint(app.state.routeDestination) ? [app.state.routeDestination] : []),
  ];
  if (nodes.length < 2) return [];
  const locations = nodes.map(mapLocation);
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

function shareRoute() {
  if (!app.state.routeStops.length) {
    app.showToast('Adicione paradas antes de compartilhar.');
    return;
  }
  const links = googleMapsLinks();
  const lines = [
    `Rota: ${$('#routeName').value.trim() || 'Radar Comercial'}`,
    $('#routeDate').value ? `Data: ${$('#routeDate').value}` : '',
    app.state.routeOrigin ? `Saída: ${app.state.routeOrigin.name}` : '',
    '',
    ...app.state.routeStops.flatMap((stop, index) => [
      `${index + 1}. ${stop.name}`,
      [stop.address, stop.city || stop.cityName, stop.state].filter(Boolean).join(', '),
    ]),
    app.state.routeDestination ? `Chegada: ${app.state.routeDestination.name}` : '',
    '',
    ...(links.length
      ? [links.length === 1 ? 'Navegar pela rota no Google Maps:' : 'Navegar por trechos no Google Maps:',
        ...links.map((link, index) => links.length === 1 ? link : `Trecho ${index + 1}: ${link}`)]
      : ['Waze — primeira parada:', `https://waze.com/ul?${new URLSearchParams({ navigate: 'yes', q: mapLocation(app.state.routeStops[0]) })}`]),
  ].filter(Boolean);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
}

async function saveRoute(button) {
  if (!app.state.routeStops.length) throw new Error('Adicione ao menos uma parada antes de salvar.');
  const origin = endpointFromInputs('routeOrigin');
  const destination = endpointFromInputs('routeDestination');
  const region = app.selectedRegion();
  button.disabled = true;
  try {
    const route = await app.api('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#routeName').value.trim() || 'Rota comercial',
        routeDate: $('#routeDate').value,
        regionId: region?.id || null,
        origin,
        destination,
        stops: app.state.routeStops.map((stop) => ({
          prospectId: stop.prospectId || null,
          customerId: stop.customerId || null,
          companyName: stop.companyName || stop.name,
          address: stop.address || null,
          city: stop.city || stop.cityName || null,
          state: stop.state || null,
          latitude: stop.latitude,
          longitude: stop.longitude,
          kind: stop.kind,
        })),
      }),
    });
    const navigation = await app.api(`/api/routes/${encodeURIComponent(route.id)}/navigation`);
    app.state.routeStops = navigation.stops.map((stop) => routeStop({
      ...stop,
      id: stop.customer_id ? `customer-${stop.customer_id}` : stop.prospect_id || stop.id,
      customerId: stop.customer_id,
      prospectId: stop.prospect_id,
      name: stop.company_name,
      kind: stop.customer_id ? 'customer' : 'prospect',
    }));
    app.state.routeOrigin = {
      name: navigation.route.origin_name, city: navigation.route.origin_city,
      state: navigation.route.origin_state, latitude: Number(navigation.route.origin_latitude),
      longitude: Number(navigation.route.origin_longitude),
    };
    app.state.routeDestination = {
      name: navigation.route.destination_name, city: navigation.route.destination_city,
      state: navigation.route.destination_state, latitude: Number(navigation.route.destination_latitude),
      longitude: Number(navigation.route.destination_longitude),
    };
    saveEndpoints();
    app.renderRoute();
    app.showToast('Rota salva. Use “Enviar rota para o WhatsApp” para compartilhar.');
  } finally {
    button.disabled = false;
  }
}

async function searchCandidates(term) {
  const requestId = ++searchRequest;
  const results = $('#routeCandidateResults');
  if (term.length < 2) {
    results.innerHTML = '';
    return;
  }
  results.innerHTML = '<p class="route-builder-help">Pesquisando…</p>';
  try {
    const candidates = await app.api(`/api/route-candidates?q=${encodeURIComponent(term)}&limit=15`);
    if (requestId !== searchRequest) return;
    candidateSearchResults = candidates.map(routeStop);
    renderCandidateSearchResults();
  } catch (error) {
    if (requestId === searchRequest) {
      results.innerHTML = `<p class="route-error">${escapeHtml(error.message)}</p>`;
    }
  }
}

function renderCandidateSearchResults() {
  const results = $('#routeCandidateResults');
  if (!results) return;
  const term = $('#routeCandidateSearch').value.trim();
  const matches = candidateSearchResults.filter((candidate) =>
    `${candidate.name} ${candidate.city} ${candidate.cnpj || ''}`.toLowerCase().includes(term.toLowerCase()));
  results.innerHTML = term.length < 2 ? '' : matches.length
    ? matches.map((candidate) => renderCandidate(candidate, null, hasStop(candidate))).join('')
    : '<p class="route-builder-help">Nenhum cliente ou prospect encontrado.</p>';
}

function segmentsModalMarkup(data, enrichmentStatus) {
  const options = data.taxonomy.map((item) =>
    `<option value="${item.micro_segment_id}">${escapeHtml(item.macro_segment)} · ${escapeHtml(item.micro_segment)}</option>`).join('');
  const mappings = data.mappings.length
    ? data.mappings.slice(0, 40).map((item) => `<article class="segment-mapping-row">
        <strong>${escapeHtml(item.cnae_fiscal)}</strong><span>${escapeHtml(item.macro_segment)} · ${escapeHtml(item.micro_segment)}</span>
        <small>${escapeHtml(item.review_status)} · ${escapeHtml(item.source_name)}</small>
      </article>`).join('')
    : '<p class="route-builder-help">Ainda não há CNAEs associados. A planilha de referência não contém CNAEs; o sistema cria associações somente ao reconciliar os nomes de clientes e consultar seus CNPJs, ou após revisão manual.</p>';
  return `<p class="eyebrow">INTELIGÊNCIA DE MERCADO</p><h2 id="modalTitle">Segmentos e CNAEs</h2>
    <p class="lead">A Tabela 1 relaciona clientes aos macro e microssegmentos. A Tabela 2 guarda os CNAEs principal e secundários; o lookalike cruza ambas para atribuir o segmento do cliente espelho.</p>
    <div class="enrichment-status"><strong>Clientes enriquecidos:</strong> ${Number(enrichmentStatus.enriched || 0).toLocaleString('pt-BR')}
      · pendentes ${Number(enrichmentStatus.pending || 0).toLocaleString('pt-BR')}
      · falhas ${Number(enrichmentStatus.failed || 0).toLocaleString('pt-BR')}
      · sem CNPJ válido ${Number(enrichmentStatus.missing_cnpj || 0).toLocaleString('pt-BR')}</div>
    <button class="secondary-button" type="button" data-feature-action="enrich-cnae">Consultar próximo lote de 5 CNPJs</button>
    <button class="secondary-button" type="button" data-feature-action="reconcile-segments">Cruzar CNAEs existentes com clientes de referência</button>
    <form id="cnaeSegmentForm" class="segment-mapping-form">
      <label>CNAE fiscal<input name="cnae" inputmode="numeric" pattern="[0-9]{7}" maxlength="7" placeholder="7 dígitos" required></label>
      <label>Microssegmento<select name="microSegmentId" required><option value="">Selecione</option>${options}</select></label>
      <button class="primary-button" type="submit">Aprovar mapeamento</button>
    </form>
    <h3>Mapeamentos de CNAE</h3><div class="segment-mapping-list">${mappings}</div>`;
}

async function openSegments() {
  app.openModal('<p class="eyebrow">INTELIGÊNCIA DE MERCADO</p><h2 id="modalTitle">Segmentos e CNAEs</h2><p class="lead">Carregando taxonomia…</p>', { wide: true });
  try {
    const [data, enrichmentStatus] = await Promise.all([
      app.api('/api/segments'),
      app.api('/api/enrichment/cnae/status'),
    ]);
    segmentData = data;
    app.openModal(segmentsModalMarkup(data, enrichmentStatus), { wide: true });
  } catch (error) {
    app.closeModal();
    app.showToast(error.message);
  }
}

document.addEventListener('radar:ready', () => {
  app = window.radarApp;
  mount();
});
if (window.radarApp) {
  app = window.radarApp;
  mount();
}

document.addEventListener('click', async (event) => {
  const featureAction = event.target.closest('[data-feature-action]')?.dataset.featureAction;
  const routeAction = event.target.closest('[data-route-action]')?.dataset.routeAction;
  const mainAction = event.target.closest('[data-action]')?.dataset.action;
  if (!app) return;
  if (featureAction || routeAction || ['share-whatsapp', 'optimize-route', 'add-route-stop'].includes(mainAction)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  if (featureAction === 'open-segments') return openSegments();
  if (featureAction === 'enrich-cnae') {
    const button = event.target.closest('button');
    button.disabled = true;
    try {
      const result = await app.api('/api/enrichment/cnae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      await app.loadLiveData();
      await app.loadOverviewCustomers();
      await openSegments();
      app.showToast(`${result.processed} empresas enriquecidas com CNAEs; ${result.failed} falhas; ${result.remaining} pendentes.`);
    } catch (error) {
      app.showToast(error.message);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (featureAction === 'reconcile-segments') {
    const button = event.target.closest('button');
    button.disabled = true;
    try {
      const result = await app.api('/api/segments/reconcile', { method: 'POST' });
      await Promise.all([app.loadLiveData(), app.loadOverviewCustomers()]);
      await openSegments();
      app.showToast(`${result.mappedCnaes} CNAEs vinculados a partir de ${result.referenceCustomers} clientes já enriquecidos.`);
    } catch (error) {
      app.showToast(error.message);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (routeAction === 'suggest') return suggestStops(event.target.closest('button'));
  if (routeAction === 'optimize' || mainAction === 'optimize-route') return optimizeStops();
  if (routeAction === 'save') {
    try { await saveRoute(event.target.closest('button')); } catch (error) { app.showToast(error.message); }
    return;
  }
  if (routeAction === 'add-candidate') {
    const id = event.target.closest('button').dataset.candidateId;
    const candidate = [...candidateSearchResults, ...routeSuggestions].find((item) => item.id === id);
    if (candidate) addCandidate(candidate);
    return;
  }
  if (mainAction === 'share-whatsapp') return shareRoute();
  if (mainAction === 'add-route-stop') {
    $('#routeCandidateSearch').focus();
    $('#routeCandidateSearch').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}, true);

document.addEventListener('input', (event) => {
  if (!app) return;
  if (event.target.id === 'routeCandidateSearch') {
    clearTimeout(searchTimer);
    const term = event.target.value.trim();
    searchTimer = setTimeout(() => searchCandidates(term), 250);
  } else if (['routeOriginCity', 'routeOriginState'].includes(event.target.id)) {
    app.state.routeOrigin = null;
    saveEndpoints();
    app.renderRouteMap();
  } else if (['routeDestinationCity', 'routeDestinationState'].includes(event.target.id)) {
    app.state.routeDestination = null;
    saveEndpoints();
    app.renderRouteMap();
  }
}, true);

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'cnaeSegmentForm') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  try {
    await app.api(`/api/segments/cnae-mappings/${encodeURIComponent(values.cnae)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ microSegmentId: Number(values.microSegmentId) }),
    });
    app.showToast('Mapeamento de CNAE aprovado.');
    await Promise.all([app.loadLiveData(), app.loadOverviewCustomers(), openSegments()]);
  } catch (error) {
    app.showToast(error.message);
  }
}, true);
