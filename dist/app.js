const prospects = [
  {id:'metalforte',name:'Metalforte Estruturas',initials:'ME',color:'#d9624d',segment:'Estruturas metálicas',city:'Campinas · SP',priority:'high',score:94,potential:'R$ 28–42 mil',distance:'3,2 km',detour:'+6 min',status:'Novo',products:'Vigas I/U, perfis e tubos',confidence:86,reasons:['Atividade altamente compatível','Porte semelhante aos melhores clientes','A 6 min da rota de sexta-feira'],cnpj:'48.***.***/0001-12',address:'Jardim do Trevo, Campinas'},
  {id:'acocalhas',name:'AçoCalhas Coberturas',initials:'AC',color:'#bd8738',segment:'Coberturas',city:'Sumaré · SP',priority:'high',score:89,potential:'R$ 18–31 mil',distance:'5,8 km',detour:'+9 min',status:'Qualificar',products:'Bobinas galvanizadas e galvalume',confidence:78,reasons:['Segmento aderente à linha de bobinas','Operação ativa e endereço confirmado','Próxima a dois clientes recorrentes'],cnpj:'21.***.***/0001-77',address:'Jardim Nova Terra, Sumaré'},
  {id:'estrutural',name:'Estrutural Norte',initials:'EN',color:'#3f7d72',segment:'Estruturas metálicas',city:'Hortolândia · SP',priority:'high',score:86,potential:'R$ 22–36 mil',distance:'8,4 km',detour:'+12 min',status:'Novo',products:'Perfis, vigas e metalon',confidence:82,reasons:['Fabricante com operação regional','Três sinais de expansão recentes','Mix de produtos compatível'],cnpj:'09.***.***/0001-30',address:'Vila Real, Hortolândia'},
  {id:'ferrovale',name:'Ferrovale Serralheria',initials:'FV',color:'#5c7189',segment:'Serralheria',city:'Valinhos · SP',priority:'medium',score:78,potential:'R$ 12–19 mil',distance:'11 km',detour:'+14 min',status:'Contato feito',products:'Tubos metalon e perfis',confidence:74,reasons:['Consumo provável de metalon','Boa proximidade logística','Contato empresarial validado'],cnpj:'35.***.***/0001-05',address:'Vila Santana, Valinhos'},
  {id:'novaobra',name:'Nova Obra Engenharia',initials:'NO',color:'#795d8f',segment:'Construção',city:'Campinas · SP',priority:'medium',score:75,potential:'R$ 16–28 mil',distance:'6,1 km',detour:'+8 min',status:'Novo',products:'Malhas, vergalhões e vigas',confidence:69,reasons:['Obras industriais em andamento','Região dentro do território','Potencial de compra por projeto'],cnpj:'62.***.***/0001-44',address:'Taquaral, Campinas'},
  {id:'serracamp',name:'SerraCamp Soluções',initials:'SS',color:'#567e62',segment:'Serralheria',city:'Campinas · SP',priority:'low',score:63,potential:'R$ 7–12 mil',distance:'14 km',detour:'+19 min',status:'Revisar dados',products:'Metalon e perfis leves',confidence:51,reasons:['Atividade econômica compatível','Dados de porte incompletos','Endereço ainda não confirmado'],cnpj:'18.***.***/0001-89',address:'Ouro Verde, Campinas'}
];

const visits = [
  {date:'22 out',time:'14:30',company:'Serralheria Horizonte',city:'Campinas',seller:'Carlos Mendes',initials:'CM',result:'Oportunidade aberta',kind:'success',next:'Enviar cotação · 24 out'},
  {date:'22 out',time:'10:15',company:'Calhas Primavera',city:'Sumaré',seller:'Ana Beatriz',initials:'AB',result:'Contato realizado',kind:'success',next:'Retornar · 29 out'},
  {date:'21 out',time:'16:40',company:'Metalúrgica União',city:'Hortolândia',seller:'Carlos Mendes',initials:'CM',result:'Decisor ausente',kind:'warn',next:'Nova visita · 28 out'},
  {date:'21 out',time:'09:20',company:'Aço & Forma',city:'Valinhos',seller:'Juliana Reis',initials:'JR',result:'Sem aderência',kind:'neutral',next:'Arquivado'},
  {date:'20 out',time:'11:00',company:'ConstriMais Obras',city:'Campinas',seller:'Ana Beatriz',initials:'AB',result:'Oportunidade aberta',kind:'success',next:'Reunião · 27 out'}
];

const routeStops = [
  {time:'08:00',name:'Saída · Filial Campinas',desc:'Av. das Amoreiras, 1820'},
  {time:'08:35',name:'Serralheria Horizonte',desc:'Visita agendada · 45 min'},
  {time:'09:42',name:'Metalforte Estruturas',desc:'Prospecção sugerida · 30 min',prospect:true},
  {time:'11:00',name:'Aço & Forma Industrial',desc:'Visita agendada · 50 min'},
  {time:'13:25',name:'AçoCalhas Coberturas',desc:'Prospecção sugerida · 30 min',prospect:true},
  {time:'14:30',name:'Metalúrgica União',desc:'Visita agendada · 45 min'}
];

const state = {selected:'metalforte',view:'overview'};
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];

function priorityLabel(level){return level==='high'?'Alta':level==='medium'?'Média':'Baixa'}
function renderPriorities(){
  $('#priorityList').innerHTML=prospects.slice(0,5).map((p,i)=>`<div class="priority-item" data-select="${p.id}"><span class="priority-rank">0${i+1}</span><div><h3>${p.name}</h3><p>${p.segment} · ${p.city.split(' · ')[0]}</p></div><div class="priority-score" style="--score:${p.score}"><span>${p.score}</span></div></div>`).join('');
}

function renderProspects(){
  const term=$('#prospectSearch').value.trim().toLowerCase();
  const segment=$('#segmentFilter').value;
  const priority=$('#priorityFilter').value;
  const filtered=prospects.filter(p=>(!term||`${p.name} ${p.city} ${p.cnpj}`.toLowerCase().includes(term))&&(segment==='all'||p.segment===segment)&&(priority==='all'||p.priority===priority));
  $('#prospectRows').innerHTML=filtered.map(p=>`<div class="prospect-row ${p.id===state.selected?'selected':''}" data-select="${p.id}"><div class="company-cell"><span class="company-logo" style="background:${p.color}">${p.initials}</span><div><strong>${p.name}</strong><small>${p.segment} · ${p.city}</small></div></div><div class="fit-score">${p.score}%<small>${priorityLabel(p.priority)} prioridade</small></div><div class="potential-cell"><strong>${p.potential}</strong><small>estimativa orientativa</small></div><div class="distance">${p.distance}<small>${p.detour} de desvio</small></div><span class="status-chip ${p.priority}">${p.status}</span><button class="row-more" aria-label="Mais ações">•••</button></div>`).join('');
  $('#prospectEmpty').style.display=filtered.length?'none':'block';
  renderDetail();
}

function renderDetail(){
  const p=prospects.find(x=>x.id===state.selected)||prospects[0];
  $('#prospectDetail').innerHTML=`<div class="detail-cover"><div class="detail-logo" style="background:${p.color}">${p.initials}</div></div><div class="detail-body"><span class="status-chip ${p.priority}">${priorityLabel(p.priority).toUpperCase()} PRIORIDADE</span><h2>${p.name}</h2><p class="sub">${p.segment} · ${p.city}</p><div class="detail-score"><div><span>Aderência</span><strong>${p.score}%</strong></div><div><span>Potencial mensal</span><strong>${p.potential}</strong></div></div><div class="detail-section"><h3>Por que recomendamos</h3>${p.reasons.map(r=>`<div class="reason"><i>✓</i><span>${r}</span></div>`).join('')}</div><div class="detail-section"><h3>Produtos prováveis</h3><div class="reason"><i>↗</i><span>${p.products}</span></div><div class="confidence"><span>Confiança dos dados</span><strong>${p.confidence}%</strong></div><div class="confidence-bar"><i style="width:${p.confidence}%"></i></div></div><div class="detail-section"><h3>Cadastro</h3><div class="reason"><i>•</i><span>${p.cnpj}<br>${p.address}</span></div></div><div class="detail-actions"><button class="primary-button" data-action="add-to-route">Adicionar à rota</button><button class="icon-button" data-action="edit-prospect"><svg><use href="#icon-more"></use></svg></button></div></div>`;
}

function renderRoute(){
  $('#routeStops').innerHTML=routeStops.map((s,i)=>`<div class="route-stop ${s.prospect?'prospect':''}"><span class="stop-index">${i+1}</span><div><h3>${s.name}</h3><p>${s.desc}</p></div><time>${s.time}</time>${s.prospect?'<span class="stop-tag">PROSPECT NO CAMINHO</span>':''}</div>`).join('');
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

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view],[data-view-link]');if(nav){setView(nav.dataset.view||nav.dataset.viewLink);return}
  const select=e.target.closest('[data-select]');if(select){state.selected=select.dataset.select;renderProspects();if(state.view==='overview')setView('prospects');return}
  const pin=e.target.closest('[data-prospect]');if(pin){state.selected=pin.dataset.prospect;const p=prospects.find(x=>x.id===state.selected);const pop=$('#mapPopup');$('h3',pop).textContent=p.name;$('p',pop).textContent=p.segment;$('strong',pop).textContent=p.potential;pop.classList.add('show');return}
  if(e.target.closest('.popup-close')){$('#mapPopup').classList.remove('show');return}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  if(action==='new-prospect')openModal(prospectForm());
  else if(action==='register-visit')openModal(visitForm());
  else if(action==='close-modal')closeModal();
  else if(action==='open-settings')openModal(settingsModal());
  else if(action==='open-territory')openModal(territoryModal());
  else if(action==='save-settings'){closeModal();showToast('Pesos de priorização atualizados')}
  else if(action==='save-territory'){closeModal();showToast('Território salvo com sucesso')}
  else if(action==='add-to-route'){showToast('Prospect adicionado à rota de sexta-feira')}
  else if(action==='optimize-route'){e.target.closest('button').innerHTML='<svg><use href="#icon-check"></use></svg>Rota otimizada';showToast('Melhor sequência calculada: 18 min de desvio')}
  else if(action==='add-route-stop'){setView('prospects');showToast('Escolha um prospect para adicionar à rota')}
  else if(action==='view-popup-prospect'){setView('prospects');renderProspects()}
  else if(action==='edit-route')openModal(territoryModal().replace('Território do piloto','Restrições da rota').replace('COBERTURA COMERCIAL','PLANEJAMENTO'));
  else if(['open-filters','edit-prospect','notifications','user-menu','recenter'].includes(action))showToast(action==='notifications'?'Você não tem novas notificações':'Ação disponível no protótipo');
});

$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal()});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='prospectForm'){
    const d=Object.fromEntries(new FormData(e.target));const initials=d.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();prospects.push({id:'p'+Date.now(),name:d.name,initials,color:'#557b68',segment:d.segment,city:`${d.city} · SP`,priority:d.priority,score:d.priority==='high'?84:d.priority==='medium'?71:58,potential:'A qualificar',distance:'—',detour:'—',status:'Novo',products:'A confirmar',confidence:42,reasons:['Cadastro incluído pela equipe','Aguardando enriquecimento de dados','Potencial ainda será qualificado'],cnpj:d.cnpj||'Não informado',address:'Endereço a confirmar'});$('#navProspectCount').textContent=prospects.length;state.selected=prospects.at(-1).id;closeModal();renderProspects();setView('prospects');showToast('Prospect adicionado à fila');
  }
  if(e.target.id==='visitForm'){
    const d=Object.fromEntries(new FormData(e.target));visits.unshift({date:'23 out',time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),company:d.company,city:'Campinas',seller:'Thiago Almeida',initials:'TA',result:d.result,kind:d.result.includes('Oportunidade')?'success':d.result.includes('ausente')?'warn':'neutral',next:d.next||'A definir'});closeModal();renderVisits();setView('visits');showToast('Visita registrada com sucesso');
  }
});

$('#prospectSearch').addEventListener('input',renderProspects);$('#segmentFilter').addEventListener('change',renderProspects);$('#priorityFilter').addEventListener('change',renderProspects);$('#visitSearch').addEventListener('input',e=>renderVisits(e.target.value));
$('#globalSearch').addEventListener('input',e=>{if(e.target.value){setView('prospects');$('#prospectSearch').value=e.target.value;renderProspects()}});
$('.mobile-menu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
$$('.period-picker button').forEach(b=>b.addEventListener('click',()=>{$$('.period-picker button').forEach(x=>x.classList.remove('active'));b.classList.add('active');showToast(`Período alterado para ${b.textContent}`)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus()}});

renderPriorities();renderProspects();renderRoute();renderVisits();
