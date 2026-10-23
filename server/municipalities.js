import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineKm } from './navigation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateByCode = new Map([[11,'RO'],[12,'AC'],[13,'AM'],[14,'RR'],[15,'PA'],[16,'AP'],[17,'TO'],[21,'MA'],[22,'PI'],[23,'CE'],[24,'RN'],[25,'PB'],[26,'PE'],[27,'AL'],[28,'SE'],[29,'BA'],[31,'MG'],[32,'ES'],[33,'RJ'],[35,'SP'],[41,'PR'],[42,'SC'],[43,'RS'],[50,'MS'],[51,'MT'],[52,'GO'],[53,'DF']]);

export function cityKey(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const aliases = new Map(Object.entries({
  'braganca': 'braganca-paulista',
  'campo-limpo': 'campo-limpo-paulista',
  'maripora': 'mairipora',
  'santa-rita-sapucai': 'santa-rita-do-sapucai',
  'sao-goncalo': 'sao-goncalo-do-sapucai',
  'senador': 'senador-amaral',
  'ibitiura': 'ibitiura-de-minas',
  'sapucai-mirim': 'sapucai-mirim',
}));

const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'municipios.json'), 'utf8').replace(/^\uFEFF/, ''));
export const municipalityCatalog = raw.map((item) => ({
  ibgeCode: String(item.codigo_ibge),
  city: item.nome,
  cityKey: cityKey(item.nome),
  state: stateByCode.get(Number(item.codigo_uf)),
  latitude: Number(item.latitude),
  longitude: Number(item.longitude),
})).filter((item) => item.state && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

const byName = new Map();
for (const item of municipalityCatalog) {
  if (!byName.has(item.cityKey)) byName.set(item.cityKey, []);
  byName.get(item.cityKey).push(item);
}

export function findMunicipality(name, state, near) {
  let key = cityKey(name);
  key = aliases.get(key) || key;
  let candidates = byName.get(key) || [];
  if (state) candidates = candidates.filter((item) => item.state === state.toUpperCase());
  if (!candidates.length) return null;
  if (candidates.length === 1 || !near) return candidates[0];
  return [...candidates].sort((a, b) =>
    haversineKm(near.latitude, near.longitude, a.latitude, a.longitude)
    - haversineKm(near.latitude, near.longitude, b.latitude, b.longitude))[0];
}

