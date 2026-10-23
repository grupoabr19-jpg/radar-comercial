import ExcelJS from 'exceljs';
import { haversineKm } from './navigation.js';

const aliases = {
  customerCode: ['codigo', 'cod cliente', 'codigo cliente', 'codigo do cliente', 'cliente', 'codcli', 'cod'],
  cnpj: ['cnpj', 'cpf cnpj', 'cpf/cnpj', 'documento'],
  companyName: ['razao social', 'nome cliente', 'nome do cliente', 'cliente nome', 'empresa', 'nome', 'descricao cliente'],
  tradeName: ['nome fantasia', 'fantasia'],
  city: ['cidade', 'municipio'],
  state: ['uf', 'estado'],
  postalCode: ['cep', 'codigo postal'],
  address: ['endereco', 'logradouro', 'endereco completo'],
  segment: ['segmento', 'ramo', 'atividade', 'cnae'],
  sellerName: ['vendedor', 'nome vendedor', 'representante'],
  regionCode: ['codigo regiao', 'cod regiao', 'regiao codigo'],
  regionName: ['regiao', 'nome regiao'],
  sellerType: ['tipo vendedor', 'tipo de vendedor', 'canal venda'],
  contactEmail: ['email', 'e mail'],
  phone: ['telefone', 'fone', 'celular'],
  creditLimit: ['limite credito', 'limite de credito'],
  daysSinceLastSale: ['dias sem compra', 'dias sem venda', 'dias ultima compra', 'dias desde ultima venda', 'menor dias ultima venda'],
  customerCreatedAt: ['data criacao pn', 'data cadastro', 'data de cadastro'],
  purchaseAgeBand: ['faixa ultima compra', 'faixa sem compra'],
  externalKey: ['id externo', 'codigo externo', 'id empresa'],
  potentialMin: ['potencial minimo', 'potencial min'],
  potentialMax: ['potencial maximo', 'potencial max'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lon', 'lng'],
  routeName: ['rota', 'nome rota', 'nome da rota', 'roteiro'],
  hubCity: ['cidade polo', 'cidade base', 'polo'],
  distanceFromHubKm: ['distancia do polo km', 'distancia polo', 'raio km', 'distancia km'],
};

function textValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '');
    if ('result' in value) return String(value.result ?? '');
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text).join('');
  }
  return String(value).trim();
}

export function normalizeHeader(value) {
  return textValue(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fieldForHeader(header) {
  const normalized = normalizeHeader(header);
  return Object.entries(aliases).find(([, values]) => values.includes(normalized))?.[0];
}

function scoreRow(values) {
  const recognized = values.map(fieldForHeader).filter(Boolean);
  return { score: new Set(recognized).size, recognized };
}

function findHeaderRow(worksheet) {
  let best = { rowNumber: 1, score: 0, recognized: [] };
  const limit = Math.min(worksheet.rowCount, 40);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values.slice(1).map(textValue);
    const candidate = scoreRow(values);
    if (candidate.score > best.score) best = { rowNumber, ...candidate };
  }
  if (best.score < 2) throw new Error('Não foi possível detectar um cabeçalho com pelo menos dois campos conhecidos.');
  return best;
}

function normalizeDocument(value) {
  const digits = textValue(value).replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

function normalizeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = textValue(value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function locationFromAddress(address) {
  const value = textValue(address);
  const match = value.match(/(?:^|\s-\s)([^-]+?)\/([a-z]{2})\s*$/i);
  if (!match) return {};
  return { city: match[1].trim(), state: match[2].toUpperCase() };
}

function normalizeRow(raw, mapping) {
  const normalized = {};
  for (const [column, field] of mapping.entries()) {
    const value = raw[column];
    if (!field || value === '') continue;
    normalized[field] = value;
  }
  if (normalized.cnpj) normalized.cnpj = normalizeDocument(normalized.cnpj);
  if (normalized.address && (!normalized.city || !normalized.state)) {
    const location = locationFromAddress(normalized.address);
    normalized.city ||= location.city;
    normalized.state ||= location.state;
  }
  if (normalized.state) normalized.state = textValue(normalized.state).slice(0, 2).toUpperCase();
  if (normalized.customerCode) normalized.customerCode = textValue(normalized.customerCode);
  if (!normalized.companyName && normalized.customerCode) normalized.companyName = `Cliente ${normalized.customerCode}`;
  if (normalized.customerCreatedAt) normalized.customerCreatedAt = textValue(normalized.customerCreatedAt).slice(0, 10);
  for (const field of ['creditLimit', 'daysSinceLastSale', 'potentialMin', 'potentialMax', 'latitude', 'longitude', 'distanceFromHubKm']) {
    if (normalized[field] != null) normalized[field] = normalizeNumber(normalized[field]);
  }
  return normalized;
}

export async function parseWorkbook(buffer, requestedSheet) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = requestedSheet
    ? workbook.getWorksheet(requestedSheet)
    : workbook.worksheets.at(-1);
  if (!worksheet) throw new Error(requestedSheet ? `Aba não encontrada: ${requestedSheet}` : 'A planilha não contém abas.');
  const header = findHeaderRow(worksheet);
  const headerValues = worksheet.getRow(header.rowNumber).values.slice(1).map(textValue);
  const mapping = new Map();
  headerValues.forEach((value, index) => mapping.set(index, fieldForHeader(value)));
  const rows = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values.slice(1).map(textValue);
    if (!values.some(Boolean)) continue;
    const raw = Object.fromEntries(headerValues.map((name, index) => [name || `coluna_${index + 1}`, values[index] ?? '']));
    rows.push({ rowNumber, raw, normalized: normalizeRow(values, mapping) });
  }
  return {
    sheetName: worksheet.name,
    headerRow: header.rowNumber,
    detectedFields: [...new Set([...mapping.values()].filter(Boolean))],
    rows,
  };
}

function validateRow(sourceType, row) {
  const notes = [];
  if (sourceType !== 'routes' && !row.companyName) notes.push('Nome da empresa ausente');
  if (sourceType === 'routes' && !row.city) notes.push('Cidade da rota ausente');
  if (sourceType === 'erp' && !row.customerCode) notes.push('Código do cliente ausente');
  if (row.cnpj == null && Object.hasOwn(row, 'cnpj')) notes.push('CNPJ inválido');
  return notes;
}

async function isExistingCustomer(client, row) {
  if (row.cnpj) {
    const byCnpj = await client.query('SELECT 1 FROM erp_customers WHERE cnpj = $1 LIMIT 1', [row.cnpj]);
    if (byCnpj.rowCount) return true;
  }
  if (row.companyName && row.city) {
    const byNameCity = await client.query(
      'SELECT 1 FROM erp_customers WHERE lower(company_name) = lower($1) AND lower(coalesce(city, \'\')) = lower($2) LIMIT 1',
      [row.companyName, row.city],
    );
    if (byNameCity.rowCount) return true;
  }
  return false;
}

async function upsertCustomer(client, row, batchId) {
  await client.query(`INSERT INTO erp_customers (
      customer_code, cnpj, company_name, city, state, postal_code, address, segment,
      seller_name, region_code, region_name, seller_type, contact_email, phone,
      credit_limit, days_since_last_sale, customer_created_at, purchase_age_band, source_batch_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (customer_code) DO UPDATE SET
      cnpj = coalesce(EXCLUDED.cnpj, erp_customers.cnpj), company_name = EXCLUDED.company_name,
      city = EXCLUDED.city, state = EXCLUDED.state, postal_code = EXCLUDED.postal_code,
      address = EXCLUDED.address, segment = EXCLUDED.segment, seller_name = EXCLUDED.seller_name,
      region_code = EXCLUDED.region_code, region_name = EXCLUDED.region_name,
      seller_type = EXCLUDED.seller_type, contact_email = EXCLUDED.contact_email,
      phone = EXCLUDED.phone, credit_limit = EXCLUDED.credit_limit,
      days_since_last_sale = EXCLUDED.days_since_last_sale, customer_created_at = EXCLUDED.customer_created_at,
      purchase_age_band = EXCLUDED.purchase_age_band, source_batch_id = EXCLUDED.source_batch_id,
      source_updated_at = now(), updated_at = now()`, [
    row.customerCode, row.cnpj, row.companyName, row.city, row.state, row.postalCode,
    row.address, row.segment, row.sellerName, row.regionCode, row.regionName, row.sellerType,
    row.contactEmail, row.phone, row.creditLimit, row.daysSinceLastSale,
    row.customerCreatedAt || null, row.purchaseAgeBand, batchId,
  ]);
}

async function upsertProspect(client, row, batchId) {
  await client.query(`INSERT INTO prospects (
      external_key, cnpj, company_name, trade_name, segment, city, state, postal_code,
      address, latitude, longitude, potential_min, potential_max, source_name, source_batch_id,
      score_reasons, confidence, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'planilha de candidatos',$14,$15,45,'review')
    ON CONFLICT (cnpj) WHERE cnpj IS NOT NULL DO UPDATE SET
      company_name = EXCLUDED.company_name, trade_name = EXCLUDED.trade_name,
      segment = EXCLUDED.segment, city = EXCLUDED.city, state = EXCLUDED.state,
      postal_code = EXCLUDED.postal_code, address = EXCLUDED.address,
      latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      potential_min = EXCLUDED.potential_min, potential_max = EXCLUDED.potential_max,
      source_batch_id = EXCLUDED.source_batch_id, updated_at = now()`, [
    row.externalKey, row.cnpj, row.companyName, row.tradeName, row.segment, row.city,
    row.state, row.postalCode, row.address, row.latitude, row.longitude,
    row.potentialMin, row.potentialMax, batchId,
    JSON.stringify(['Importado de fonte externa', 'Aguardando validação comercial']),
  ]);
}

function cityKey(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function upsertMunicipality(client, row, sourceName) {
  if (!row.city || !row.state) return;
  await client.query(`INSERT INTO municipalities
    (city_key, city, state, latitude, longitude, source_name)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (city_key, state) DO UPDATE SET
      city=EXCLUDED.city, latitude=coalesce(EXCLUDED.latitude, municipalities.latitude),
      longitude=coalesce(EXCLUDED.longitude, municipalities.longitude),
      source_name=EXCLUDED.source_name, updated_at=now()`,
  [cityKey(row.city), row.city, row.state, row.latitude, row.longitude, sourceName]);
}

async function syncRouteRegions(client, rows, batchId) {
  const groups = new Map();
  for (const item of rows) {
    const row = item.normalized;
    if (!row.city || !row.state) continue;
    const name = row.routeName || row.regionName || `${row.city} - ${row.state}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  for (const [name, entries] of groups) {
    const counts = new Map();
    for (const row of entries) {
      const key = `${cityKey(row.city)}|${row.state}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const explicitHub = entries.find((row) => row.hubCity && cityKey(row.hubCity) === cityKey(row.city));
    const hub = explicitHub || [...entries].sort((a, b) => counts.get(`${cityKey(b.city)}|${b.state}`) - counts.get(`${cityKey(a.city)}|${a.state}`))[0];
    const region = await client.query(`INSERT INTO route_regions
      (name, hub_city, hub_state, hub_latitude, hub_longitude, source_batch_id)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (name) DO UPDATE SET hub_city=EXCLUDED.hub_city, hub_state=EXCLUDED.hub_state,
        hub_latitude=coalesce(EXCLUDED.hub_latitude, route_regions.hub_latitude),
        hub_longitude=coalesce(EXCLUDED.hub_longitude, route_regions.hub_longitude),
        source_batch_id=EXCLUDED.source_batch_id, updated_at=now()
      RETURNING id`, [name, hub.city, hub.state, hub.latitude, hub.longitude, batchId]);
    const uniqueCities = new Map(entries.map((row) => [`${cityKey(row.city)}|${row.state}`, row]));
    for (const row of uniqueCities.values()) {
      const calculated = haversineKm(hub.latitude, hub.longitude, row.latitude, row.longitude);
      const distance = row.distanceFromHubKm ?? calculated ?? (cityKey(row.city) === cityKey(hub.city) ? 0 : null);
      await client.query(`INSERT INTO region_cities
        (region_id, city_key, city, state, latitude, longitude, distance_from_hub_km)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (region_id, city_key, state) DO UPDATE SET city=EXCLUDED.city,
          latitude=coalesce(EXCLUDED.latitude, region_cities.latitude),
          longitude=coalesce(EXCLUDED.longitude, region_cities.longitude),
          distance_from_hub_km=coalesce(EXCLUDED.distance_from_hub_km, region_cities.distance_from_hub_km), updated_at=now()`,
      [region.rows[0].id, cityKey(row.city), row.city, row.state, row.latitude, row.longitude, distance]);
    }
  }
}

export async function persistImport(client, { sourceType, fileName, requestedSheet, parsed, actorEmail }) {
  await client.query('BEGIN');
  try {
    const created = await client.query(`INSERT INTO import_batches
      (source_type, file_name, sheet_name, detected_fields, created_by)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [sourceType, fileName, parsed.sheetName, JSON.stringify(parsed.detectedFields), actorEmail]);
    const batchId = created.rows[0].id;
    let accepted = 0, rejected = 0, duplicate = 0;
    for (const item of parsed.rows) {
      const notes = validateRow(sourceType, item.normalized);
      let status = notes.length ? 'rejected' : 'accepted';
      if (!notes.length && sourceType === 'erp') await upsertCustomer(client, item.normalized, batchId);
      if (!notes.length && sourceType === 'candidates') {
        if (await isExistingCustomer(client, item.normalized)) {
          status = 'duplicate';
          notes.push('Empresa já consta na base do ERP');
          duplicate += 1;
        } else {
          await upsertProspect(client, item.normalized, batchId);
        }
      }
      if (!notes.length && ['routes', 'candidates'].includes(sourceType)) {
        await upsertMunicipality(client, item.normalized, sourceType);
      }
      if (status === 'accepted') accepted += 1;
      if (status === 'rejected') rejected += 1;
      await client.query(`INSERT INTO import_rows
        (batch_id, row_number, raw_data, normalized_data, validation_status, validation_notes)
        VALUES ($1,$2,$3,$4,$5,$6)`, [batchId, item.rowNumber, item.raw, item.normalized, status, notes]);
    }
    if (sourceType === 'routes') {
      const validRows = parsed.rows.filter((item) => !validateRow(sourceType, item.normalized).length);
      await syncRouteRegions(client, validRows, batchId);
    }
    await client.query(`UPDATE import_batches SET status='completed', total_rows=$2,
      accepted_rows=$3, rejected_rows=$4, completed_at=now() WHERE id=$1`,
    [batchId, parsed.rows.length, accepted, rejected]);
    await client.query('COMMIT');
    return { batchId, sheetName: parsed.sheetName, total: parsed.rows.length, accepted, rejected, duplicate, detectedFields: parsed.detectedFields };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

