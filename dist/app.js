const demoProspects = [
  {id:'metalforte',name:'Metalforte Estruturas',initials:'ME',color:'#d9624d',segment:'Estruturas metálicas',city:'Campinas · SP',priority:'high',score:94,potential:'R$ 28–42 mil',distance:'3,2 km',detour:'+6 min',status:'Novo',products:'Vigas I/U, perfis e tubos',confidence:86,reasons:['Atividade altamente compatível','Porte semelhante aos melhores clientes','A 6 min da rota de sexta-feira'],cnpj:'48.***.***/0001-12',address:'Jardim do Trevo, Campinas'},
  {id:'acocalhas',name:'AçoCalhas Coberturas',initials:'AC',color:'#bd8738',segment:'Coberturas',city:'Sumaré · SP',priority:'high',score:89,potential:'R$ 18–31 mil',distance:'5,8 km',detour:'+9 min',status:'Qualificar',products:'Bobinas galvanizadas e galvalume',confidence:78,reasons:['Segmento aderente à linha de bobinas','Operação ativa e endereço confirmado','Próxima a dois clientes recorrentes'],cnpj:'21.***.***/0001-77',address:'Jardim Nova Terra, Sumaré'},
  {id:'estrutural',name:'Estrutural Norte',initials:'EN',color:'#3f7d72',segment:'Estruturas metálicas',city:'Hortolândia · SP',priority:'high',score:86,potential:'R$ 22–36 mil',distance:'8,4 km',detour:'+12 min',status:'Novo',products:'Perfis, vigas e metalon',confidence:82,reasons:['Fabricante com operação regional','Três sinais de expansão recentes','Mix de produtos compatível'],cnpj:'09.***.***/0001-30',address:'Vila Real, Hortolândia'},
  {id:'ferrovale',name:'Ferrovale Serralheria',initials:'FV',color:'#5c7189',segment:'Serralheria',city:'Valinhos · SP',priority:'medium',score:78,potential:'R$ 12–19 mil',distance:'11 km',detour:'+14 min',status:'Contato feito',products:'Tubos metalon e perfis',confidence:74,reasons:['Consumo provável de metalon','Boa proximidade logística','Contato empresarial validado'],cnpj:'35.***.***/0001-05',address:'Vila Santana, Valinhos'},
  {id:'novaobra',name:'Nova Obra Engenharia',initials:'NO',color:'#795d8f',segment:'Construção',city:'Campinas · SP',priority:'medium',score:75,potential:'R$ 16–28 mil',distance:'6,1 km',detour:'+8 min',status:'Novo',products:'Malhas, vergalhões e vigas',confidence:69,reasons:['Obras industriais em andamento','Região dentro do território','Potencial de compra por projeto'],cnpj:'62.***.***/0001-44',address:'Taquaral, Campinas'},
  {id:'serracamp',name:'SerraCamp Soluções',initials:'SS',color:'#567e62',segment:'Serralheria',city:'Campinas · SP',priority:'low',score:63,potential:'R$ 7–12 mil',distance:'14 km',detour:'+19 min',status:'Revisar dados',products:'Metalon e perfis leves',confidence:51,reasons:['Atividade econômica compatível','Dados de porte incompletos','Endereço ainda não confirmado'],cnpj:'18.***.***/0001-89',address:'Ouro Verde, Campinas'}
];

const prospects = [];

const demoVisits = [
  {date:'22 out',time:'14:30',company:'Serralheria Horizonte',city:'Campinas',seller:'Carlos Mendes',initials:'CM',result:'Oportunidade aberta',kind:'success',next:'Enviar cotação · 24 out'},
  {date:'22 out',time:'10:15',company:'Calhas Primavera',city:'Sumaré',seller:'Ana Beatriz',initials:'AB',result:'Contato realizado',kind:'success',next:'Retornar · 29 out'},
  {date:'21 out',time:'16:40',company:'Metalúrgica União',city:'Hortolândia',seller:'Carlos Mendes',initials:'CM',result:'Decisor ausente',kind:'warn',next:'Nova visita · 28 out'},
  {date:'21 out',time:'09:20',company:'Aço & Forma',city:'Valinhos',seller:'Juliana Reis',initials:'JR',result:'Sem aderência',kind:'neutral',next:'Arquivado'},
  {date:'20 out',time:'11:00',company:'ConstriMais Obras',city:'Campinas',seller:'Ana Beatriz',initials:'AB',result:'Oportunidade aberta',kind:'success',next:'Reunião · 27 out'}
];

const visits = [];

const routeStops = [
  {time:'08:00',name:'Saída · Filial Campinas',desc:'Av. das Amoreiras, 1820',address:'Av. das Amoreiras, 1820',city:'Campinas',state:'SP'},
  {time:'08:35',name:'Serralheria Horizonte',desc:'Visita agendada · 45 min',city:'Campinas',state:'SP'},
  {time:'09:42',name:'Metalforte Estruturas',desc:'Prospecção sugerida · 30 min',city:'Campinas',state:'SP',prospect:true},
  {time:'11:00',name:'Aço & Forma Industrial',desc:'Visita agendada · 50 min',city:'Campinas',state:'SP'},
  {time:'13:25',name:'AçoCalhas Coberturas',desc:'Prospecção sugerida · 30 min',city:'Sumaré',state:'SP',prospect:true},
  {time:'14:30',name:'Metalúrgica União',desc:'Visita agendada · 45 min',city:'Hortolândia',state:'SP'}
];

const state = {selected:'metalforte',view:'overview',regions:[],regionFilter:null};
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];

function priorityLabel(level){return level==='high'?'Alta':level==='medium'?'Média':'Baixa'}
function moneyRange(min,max){
  if(min==null&&max==null)return 'A qualificar';
  const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
  return min!=null&&max!=null?`${brl(min)}–${brl(max)}`:brl(max??min);
}
function makeInitials(name=''){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'--'}
function toProspect(row){return {id:row.id,name:row.trade_name||row.company_name,initials:makeInitials(row.trade_name||row.company_name),color:'#557b68',segment:row.segment||'A classificar',city:[row.city,row.state].filter(Boolean).join(' · ')||'Local a confirmar',priority:row.priority||'medium',score:Number(row.score||0),potential:moneyRange(row.potential_min,row.potential_max),distance:'—',detour:'—',status:{new:'Novo',qualify:'Qualificar',contacted:'Contato feito',review:'Revisar dados'}[row.status]||row.status,products:(row.product_families||[]).join(', ')||'A confirmar',confidence:Number(row.confidence||0),reasons:(row.score_reasons||[]).length?row.score_reasons:['Aguardando qualificação'],cnpj:row.cnpj||'Não informado',address:row.address||'Endereço a confirmar'} }
function toVisit(row){const date=new Date(row.visited_at);return {date:date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.',''),time:date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),company:row.company_name,city:row.city||'',seller:row.seller_name,initials:makeInitials(row.seller_name),result:row.result,kind:row.result.includes('Oportunidade')?'success':row.result.includes('ausente')?'warn':'neutral',next:row.next_action||'A definir'} }
async function api(url,options={}){const response=await fetch(url,options);if(response.status===401){window.location.replace('/login.html');throw new Error('Sessão expirada.')}const data=response.status===204?null:await response.json();if(!response.ok)throw new Error(data?.error||'Falha na operação.');return data}
async function loadLiveData(){
  try{
    const [prospectRows,visitRows,dashboard]=await Promise.all([api('/api/prospects'),api('/api/visits'),api('/api/dashboard')]);
    prospects.splice(0,prospects.length,...prospectRows.map(toProspect));visits.splice(0,visits.length,...visitRows.map(toVisit));
    state.selected=prospects[0]?.id||null;$('#navProspectCount').textContent=dashboard.prospects||0;
    const metrics=$$('.metric-card strong');if(metrics[0])metrics[0].textContent=dashboard.prospects||0;if(metrics[1])metrics[1].textContent=dashboard.high_priority||0;if(metrics[2])metrics[2].textContent=dashboard.visits_month||0;if(metrics[3])metrics[3].textContent=moneyRange(null,dashboard.potential_max);
    renderPriorities();renderProspects();renderVisits();
  }catch(error){prospects.splice(0,prospects.length);visits.splice(0,visits.length);renderPriorities();renderProspects();renderVisits();showToast(`Dados indisponíveis: ${error.message}`)}
}

function wazeUrl(stop){const params=new URLSearchParams({navigate:'yes',utm_source:'radar_comercial'});if(Number.isFinite(Number(stop.latitude))&&Number.isFinite(Number(stop.longitude))){params.set('ll',`${Number(stop.latitude)},${Number(stop.longitude)}`)}else{params.set('q',[stop.address,stop.city,stop.state].filter(Boolean).join(', '))}return `https://waze.com/ul?${params}`}
function whatsappRouteUrl(){const lines=['Rota comercial programada','','Abra cada parada no Waze ao iniciar o próximo trecho:',''];routeStops.forEach((stop,index)=>lines.push(`${index+1}. ${stop.name}`,wazeUrl(stop),''));return `https://wa.me/?text=${encodeURIComponent(lines.join('\n').trim())}`}
async function loadRegions(){
  const radius=Number($('#regionRadius')?.value||50);$('#regionRadiusValue').textContent=`${radius} km`;
  try{state.regions=await api(`/api/regions?radiusKm=${radius}`);renderRegions()}catch(error){state.regions=[];renderRegions()}
}
function renderRegions(){
  const select=$('#regionSelect');if(!select)return;const previous=select.value;
  select.innerHTML=state.regions.length?state.regions.map(region=>`<option value="${region.id}">${region.name} · polo ${region.hubCity}/${region.hubState}</option>`).join(''):'<option value="">Nenhuma região importada</option>';
  if(state.regions.some(region=>region.id===previous))select.value=previous;
  const region=state.regions.find(item=>item.id===select.value)||state.regions[0];
  if(!region){$('#regionCities').innerHTML='<span class="city-pill muted">Aguardando planilha de rotas</span>';$('#regionHelp').textContent='Importe a planilha de rotas para criar cidades-polo automaticamente.';return}
  const expansion=region.canExpandByRadius?'O raio inclui automaticamente outras cidades com coordenadas disponíveis.':'Adicione coordenadas para expansão automática do raio.';$('#regionHelp').textContent=`${region.prospectCount||0} prospects mapeados neste raio. ${expansion}`;
  $('#regionCities').innerHTML=region.cities.length?region.cities.map(city=>`<span class="city-pill ${city.source==='radius'?'expanded':''}">${city.city}/${city.state}${city.distanceKm==null?'':` · ${Math.round(city.distanceKm)} km`}</span>`).join(''):'<span class="city-pill muted">Nenhuma cidade neste raio</span>';
}
function renderPriorities(){
  $('#priorityList').innerHTML=prospects.slice(0,5).map((p,i)=>`<div class="priority-item" data-select="${p.id}"><span class="priority-rank">0${i+1}</span><div><h3>${p.name}</h3><p>${p.segment} · ${p.city.split(' · ')[0]}</p></div><div class="priority-score" style="--score:${p.score}"><span>${p.score}</span></div></div>`).join('');
}

function renderProspects(){
  const term=$('#prospectSearch').value.trim().toLowerCase();
  const segment=$('#segmentFilter').value;
  const priority=$('#priorityFilter').value;
  const filtered=prospects.filter(p=>(!state.regionFilter||state.regionFilter.includes(p.id))&&(!term||`${p.name} ${p.city} ${p.cnpj}`.toLowerCase().includes(term))&&(segment==='all'||p.segment===segment)&&(priority==='all'||p.priority===priority));
  $('#prospectRows').innerHTML=filtered.map(p=>`<div class="prospect-row ${p.id===state.selected?'selected':''}" data-select="${p.id}"><div class="company-cell"><span class="company-logo" style="background:${p.color}">${p.initials}</span><div><strong>${p.name}</strong><small>${p.segment} · ${p.city}</small></div></div><div class="fit-score">${p.score}%<small>${priorityLabel(p.priority)} prioridade</small></div><div class="potential-cell"><strong>${p.potential}</strong><small>estimativa orientativa</small></div><div class="distance">${p.distance}<small>${p.detour} de desvio</small></div><span class="status-chip ${p.priority}">${p.status}</span><button class="row-more" aria-label="Mais ações">•••</button></div>`).join('');
  $('#prospectEmpty').style.display=filtered.length?'none':'block';
  $('#clearRegionFilter').style.display=state.regionFilter?'flex':'none';
  renderDetail();
}

function renderDetail(){
  const p=prospects.find(x=>x.id===state.selected)||prospects[0];
  if(!p){$('#prospectDetail').innerHTML='<div class="empty-state" style="display:block"><h3>Nenhum prospect cadastrado</h3><p>Importe candidatos externos ou adicione um prospect.</p></div>';return}
  $('#prospectDetail').innerHTML=`<div class="detail-cover"><div class="detail-logo" style="background:${p.color}">${p.initials}</div></div><div class="detail-body"><span class="status-chip ${p.priority}">${priorityLabel(p.priority).toUpperCase()} PRIORIDADE</span><h2>${p.name}</h2><p class="sub">${p.segment} · ${p.city}</p><div class="detail-score"><div><span>Aderência</span><strong>${p.score}%</strong></div><div><span>Potencial mensal</span><strong>${p.potential}</strong></div></div><div class="detail-section"><h3>Por que recomendamos</h3>${p.reasons.map(r=>`<div class="reason"><i>✓</i><span>${r}</span></div>`).join('')}</div><div class="detail-section"><h3>Produtos prováveis</h3><div class="reason"><i>↗</i><span>${p.products}</span></div><div class="confidence"><span>Confiança dos dados</span><strong>${p.confidence}%</strong></div><div class="confidence-bar"><i style="width:${p.confidence}%"></i></div></div><div class="detail-section"><h3>Cadastro</h3><div class="reason"><i>•</i><span>${p.cnpj}<br>${p.address}</span></div></div><div class="detail-actions"><button class="primary-button" data-action="add-to-route">Adicionar à rota</button><button class="icon-button" data-action="edit-prospect"><svg><use href="#icon-more"></use></svg></button></div></div>`;
}

function renderRoute(){
  $('#routeStops').innerHTML=routeStops.map((s,i)=>`<div class="route-stop ${s.prospect?'prospect':''}"><span class="stop-index">${i+1}</span><div><h3>${s.name}</h3><p>${s.desc}</p></div><time>${s.time}</time>${s.prospect?'<span class="stop-tag">PROSPECT NO CAMINHO</span>':''}<a class="waze-link" href="${wazeUrl(s)}" target="_blank" rel="noopener">Abrir no Waze</a></div>`).join('');
}

function renderVisits(term=''){
  term=term.toLowerCase();
  $('#visitRows').innerHTML=visits.filter(v=>`${v.company} ${v.seller} ${v.result}`.toLowerCase().includes(term)).map(v=>`<div class="visit-row"><div><strong>${v.date}</strong><small>${v.time}</small></div><div><strong>${v.company}</strong><small>${v.city}</small></div><div><strong>${v.seller}</strong><small>${v.initials}</small></div><span class="result-chip ${v.kind}">${v.result}</span><div><strong>${v.next.split(' · ')[0]}</strong><small>${v.next.split(' · ')[1]||''}</small></div></div>`).join('');
}

const viewMeta={overview:['Operação comercial','Visão geral'],prospects:['Inteligência comercial','Prospects'],routes:['Planejamento','Planejar rota'],visits:['Retorno de campo','Visitas']};
function setView(view){
  if(!viewMeta[view])return;
  state.view=view;
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#${view}View`).classList.add('active');
  $$('.nav-item[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  $('#viewEyebrow').textContent=viewMeta[view][0];$('#viewTitle').textContent=viewMeta[view][1];
  $('.sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
}

function showToast(message){const toast=$('#toast');$('span',toast).textContent=message;toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('show'),2800)}
function openModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.add('open');$('#modalBackdrop').setAttribute('aria-hidden','false');setTimeout(()=>$('.modal input,.modal select')?.focus(),100)}
function closeModal(){$('#modalBackdrop').classList.remove('open');$('#modalBackdrop').setAttribute('aria-hidden','true')}

function prospectForm(){return `<p class="eyebrow">NOVO CADASTRO</p><h2 id="modalTitle">Adicionar prospect</h2><p class="lead">Inclua uma oportunidade encontrada pela equipe. Campos sem confirmação podem ser atualizados depois.</p><form id="prospectForm"><div class="form-grid"><div class="form-field full"><label>Empresa</label><input name="name" required placeholder="Nome fantasia ou razão social"></div><div class="form-field"><label>Segmento</label><select name="segment"><option>Serralheria</option><option>Estruturas metálicas</option><option>Coberturas</option><option>Construção</option></select></div><div class="form-field"><label>Cidade</label><input name="city" required placeholder="Ex.: Campinas"></div><div class="form-field"><label>CNPJ</label><input name="cnpj" placeholder="00.000.000/0001-00"></div><div class="form-field"><label>Potencial inicial</label><select name="priority"><option value="medium">Médio</option><option value="high">Alto</option><option value="low">Baixo</option></select></div><div class="form-field full"><label>Observações</label><textarea name="notes" placeholder="Produtos utilizados, indicação, contexto da oportunidade..."></textarea></div></div><div class="modal-footer"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button">Salvar prospect</button></div></form>`}
function visitForm(){return `<p class="eyebrow">RETORNO DE CAMPO</p><h2 id="modalTitle">Registrar visita</h2><p class="lead">Um registro simples melhora as próximas recomendações.</p><form id="visitForm"><div class="form-grid"><div class="form-field full"><label>Empresa</label><select name="company">${prospects.map(p=>`<option>${p.name}</option>`).join('')}</select></div><div class="form-field"><label>Resultado</label><select name="result"><option>Contato realizado</option><option>Oportunidade aberta</option><option>Decisor ausente</option><option>Sem aderência</option></select></div><div class="form-field"><label>Próxima ação</label><input name="next" placeholder="Ex.: Enviar cotação"></div><div class="form-field full"><label>Notas da visita</label><textarea name="notes" placeholder="Necessidade, especificação, volume e frequência observados..."></textarea></div></div><div class="modal-footer"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button">Registrar visita</button></div></form>`}
function settingsModal(){return `<p class="eyebrow">MODELO DE PRIORIZAÇÃO</p><h2 id="modalTitle">Critérios e pesos</h2><p class="lead">A pontuação é explicável. Ajuste o que mais importa para a operação.</p>${[['Aderência ao segmento',35],['Potencial de compra',30],['Proximidade da rota',20],['Qualidade dos dados',15]].map(([l,v])=>`<div class="settings-row"><header><span>${l}</span><b>${v}%</b></header><input type="range" min="0" max="50" value="${v}"><small>Impacto atual no ranking de oportunidades</small></div>`).join('')}<div class="modal-footer"><button class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" data-action="save-settings">Aplicar pesos</button></div>`}
function territoryModal(){return `<p class="eyebrow">COBERTURA COMERCIAL</p><h2 id="modalTitle">Território do piloto</h2><p class="lead">Região configurada para descoberta e planejamento de visitas.</p><div class="form-grid"><div class="form-field full"><label>Municípios incluídos</label><input value="Campinas, Sumaré, Hortolândia, Valinhos"></div><div class="form-field"><label>Raio máximo</label><input value="45 km"></div><div class="form-field"><label>Desvio máximo</label><input value="20 min"></div><div class="form-field full"><label>Responsável</label><select><option>Equipe Campinas</option><option>Carlos Mendes</option><option>Ana Beatriz</option></select></div></div><div class="modal-footer"><button class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" data-action="save-territory">Salvar território</button></div>`}
function importModal(){return `<p class="eyebrow">ENTRADA DE DADOS</p><h2 id="modalTitle">Importar planilha</h2><p class="lead">A última aba é usada por padrão. Todas as linhas ficam registradas para conferência.</p><form id="importForm"><div class="form-grid"><div class="form-field full"><label>Tipo de base</label><select name="sourceType"><option value="erp">Clientes do ERP (exclusão e histórico)</option><option value="routes">Rotas e visitas existentes</option><option value="candidates">Candidatos externos (novos prospects)</option></select></div><div class="form-field full"><label>Arquivo Excel</label><input type="file" name="file" accept=".xlsx" required></div><div class="form-field full"><label>Nome da aba (opcional)</label><input name="sheetName" placeholder="Vazio = última aba"></div></div><div id="importResult"></div><div class="modal-footer"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button">Processar planilha</button></div></form>`}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view],[data-view-link]');if(nav){setView(nav.dataset.view||nav.dataset.viewLink);return}
  const select=e.target.closest('[data-select]');if(select){state.selected=select.dataset.select;renderProspects();if(state.view==='overview')setView('prospects');return}
  const pin=e.target.closest('[data-prospect]');if(pin){state.selected=pin.dataset.prospect;const p=prospects.find(x=>x.id===state.selected);if(!p)return;const pop=$('#mapPopup');$('h3',pop).textContent=p.name;$('p',pop).textContent=p.segment;$('strong',pop).textContent=p.potential;pop.classList.add('show');return}
  if(e.target.closest('.popup-close')){$('#mapPopup').classList.remove('show');return}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  if(action==='new-prospect')openModal(prospectForm());
  else if(action==='register-visit')openModal(visitForm());
  else if(action==='import-data')openModal(importModal());
  else if(action==='close-modal')closeModal();
  else if(action==='open-settings')openModal(settingsModal());
  else if(action==='open-territory')openModal(territoryModal());
  else if(action==='save-settings'){closeModal();showToast('Pesos de priorização atualizados')}
  else if(action==='save-territory'){closeModal();showToast('Território salvo com sucesso')}
  else if(action==='add-to-route'){showToast('Prospect adicionado à rota de sexta-feira')}
  else if(action==='optimize-route'){e.target.closest('button').innerHTML='<svg><use href="#icon-check"></use></svg>Rota otimizada';showToast('Melhor sequência calculada: 18 min de desvio')}
  else if(action==='share-whatsapp'){window.open(whatsappRouteUrl(),'_blank','noopener')}
  else if(action==='view-region-prospects'){const region=state.regions.find(item=>item.id===$('#regionSelect').value)||state.regions[0];if(!region){showToast('Importe a planilha de rotas primeiro');return}state.regionFilter=region.prospectIds||[];setView('prospects');renderProspects();showToast(`${region.prospectCount||0} prospects no raio selecionado`)}
  else if(action==='clear-region-filter'){state.regionFilter=null;renderProspects();showToast('Filtro de região removido')}
  else if(action==='add-route-stop'){setView('prospects');showToast('Escolha um prospect para adicionar à rota')}
  else if(action==='view-popup-prospect'){setView('prospects');renderProspects()}
  else if(action==='edit-route')openModal(territoryModal().replace('Território do piloto','Restrições da rota').replace('COBERTURA COMERCIAL','PLANEJAMENTO'));
  else if(action==='user-menu'){api('/api/auth/logout',{method:'POST'}).finally(()=>window.location.replace('/login.html'))}
  else if(['open-filters','edit-prospect','notifications','recenter'].includes(action))showToast(action==='notifications'?'Você não tem novas notificações':'Ação ainda não configurada');
});

$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal()});
document.addEventListener('submit',async e=>{
  e.preventDefault();
  if(e.target.id==='prospectForm'){
    try{const d=Object.fromEntries(new FormData(e.target));await api('/api/prospects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyName:d.name,segment:d.segment,city:d.city,state:'SP',cnpj:d.cnpj,priority:d.priority,notes:d.notes})});closeModal();await loadLiveData();setView('prospects');showToast('Prospect adicionado à fila')}catch(error){showToast(error.message)}
  }
  if(e.target.id==='visitForm'){
    try{const d=Object.fromEntries(new FormData(e.target));const p=prospects.find(x=>x.name===d.company);await api('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prospectId:p?.id,companyName:d.company,city:p?.city?.split(' · ')[0],result:d.result,nextAction:d.next,notes:d.notes})});closeModal();await loadLiveData();setView('visits');showToast('Visita registrada com sucesso')}catch(error){showToast(error.message)}
  }
  if(e.target.id==='importForm'){
    const button=e.target.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Processando…';
    try{const result=await api('/api/imports',{method:'POST',body:new FormData(e.target)});$('#importResult').innerHTML=`<div class="import-summary"><strong>${result.total} linhas processadas</strong><br>${result.accepted} aceitas · ${result.duplicate} já existentes no ERP · ${result.rejected} rejeitadas<br>Aba: ${result.sheetName}<br>Campos: ${result.detectedFields.join(', ')}</div>`;button.textContent='Concluído';await loadLiveData();showToast('Planilha importada e auditada')}catch(error){button.disabled=false;button.textContent='Processar planilha';$('#importResult').innerHTML=`<div class="login-error">${error.message}</div>`}
  }
});

$('#prospectSearch').addEventListener('input',renderProspects);$('#segmentFilter').addEventListener('change',renderProspects);$('#priorityFilter').addEventListener('change',renderProspects);$('#visitSearch').addEventListener('input',e=>renderVisits(e.target.value));
$('#globalSearch').addEventListener('input',e=>{if(e.target.value){setView('prospects');$('#prospectSearch').value=e.target.value;renderProspects()}});
$('#regionSelect').addEventListener('change',renderRegions);$('#regionRadius').addEventListener('input',()=>{$('#regionRadiusValue').textContent=`${$('#regionRadius').value} km`});$('#regionRadius').addEventListener('change',loadRegions);
$('.mobile-menu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
$$('.period-picker button').forEach(b=>b.addEventListener('click',()=>{$$('.period-picker button').forEach(x=>x.classList.remove('active'));b.classList.add('active');showToast(`Período alterado para ${b.textContent}`)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus()}});

renderPriorities();renderProspects();renderRoute();renderVisits();loadLiveData();loadRegions();
