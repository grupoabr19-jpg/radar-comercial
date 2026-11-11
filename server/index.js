import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import { clearSessionCookie, createSession, readSession, requireApiAuth, requirePageAuth, setSessionCookie, verifyPassword } from './auth.js';
import { getPool, query } from './db.js';
import { migrate } from './migrate.js';
import { parseRetailRouteMatrix, parseWorkbook, persistImport } from './importer.js';
import { downloadGoogleSpreadsheet } from './google-sheet.js';
import { buildRouteShare, buildWazeUrl, distanceToRouteKm, haversineKm, orderStopsByProximity } from './navigation.js';
import { syncGoogleSheet } from './sheet-sync.js';
import { lookupCep, lookupCnpj } from './brasil-api.js';
import { findMunicipality } from './municipalities.js';
import { enrichCustomersCnae } from './cnae-enrichment.js';
import { listSegments, reconcileReferenceSegmentMappings, reviewCnaeSegment } from './segments.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultGoogleSheetUrl = 'https://docs.google.com/spreadsheets/d/18WarJapxqvW4s61k5rjE4qTGsDorr29rJ9QkOG0IO2M/edit';
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'degraded', database: 'unavailable', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const expectedEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const validPassword = verifyPassword(String(req.body.password || ''), process.env.ADMIN_PASSWORD);
  if (!expectedEmail || email !== expectedEmail || !validPassword) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  setSessionCookie(res, createSession(email));
  await query(`INSERT INTO audit_events(actor_email, action, entity_type, metadata)
    VALUES ($1,'login','session',$2)`, [email, { ip: req.ip }]);
  res.json({ email });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/auth/session', (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Sessão ausente ou expirada.' });
  res.json({ email: session.email });
});

app.use('/api', requireApiAuth);

function normalizeRouteEndpoint(value, label) {
  if (!value || typeof value !== 'object') return null;
  const city = String(value.city || '').trim();
  const state = String(value.state || '').trim().toUpperCase();
  const municipality = city && state ? findMunicipality(city, state) : null;
  const hasLatitude = value.latitude != null;
  const hasLongitude = value.longitude != null;
  if (hasLatitude !== hasLongitude) {
    const error = new Error(`${label} deve informar latitude e longitude juntas.`);
    error.status = 400;
    throw error;
  }
  const latitude = hasLatitude ? Number(value.latitude) : municipality?.latitude;
  const longitude = hasLongitude ? Number(value.longitude) : municipality?.longitude;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    const error = new Error(`${label} precisa de coordenadas válidas ou de uma cidade e UF reconhecidas.`);
    error.status = 400;
    throw error;
  }
  return {
    name: String(value.name || city || label).trim().slice(0, 120),
    city: city || municipality?.city || null,
    state: state || municipality?.state || null,
    latitude,
    longitude,
  };
}

function routeCandidateFromRow(row) {
  return {
    id: `${row.kind}-${row.entity_id}`,
    entityId: row.entity_id,
    customerId: row.customer_id,
    prospectId: row.prospect_id,
    kind: row.kind,
    name: row.trade_name || row.company_name,
    tradeName: row.trade_name,
    companyName: row.company_name,
    address: row.address,
    city: row.city,
    cityName: row.city,
    state: row.state,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    cnpj: row.cnpj,
    portfolioStatus: row.portfolio_status,
    status: row.status,
    macroSegment: row.macro_segment,
    microSegment: row.micro_segment,
    locationAccuracy: row.location_accuracy,
  };
}

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const result = await query(`SELECT
      count(*) FILTER (WHERE status IN ('new','qualify','review'))::int AS prospects,
      count(*) FILTER (WHERE priority='high' AND status NOT IN ('won','lost','do_not_contact'))::int AS high_priority,
      coalesce(sum(potential_max) FILTER (WHERE status NOT IN ('won','lost','do_not_contact')),0)::numeric AS potential_max
      FROM prospects`);
    const visits = await query(`SELECT count(*)::int AS visits_month FROM visits
      WHERE visited_at >= date_trunc('month', now())`);
    const operational = await query(`SELECT
      (SELECT count(*)::int FROM erp_customers) AS customers,
      (SELECT count(*)::int FROM company_cnaes) AS customers_with_cnae,
      (SELECT count(*)::int FROM prospecting_cnaes WHERE enabled) AS target_cnaes,
      (SELECT count(*)::int FROM prospecting_cnaes WHERE review_status='pending') AS pending_cnaes,
      (SELECT count(DISTINCT candidate_cnae)::int FROM prospecting_cnae_matches WHERE enabled) AS related_cnaes,
      (SELECT count(*)::int FROM cnae_segment_mappings WHERE review_status='approved') AS cnae_segment_mappings,
      (SELECT count(*)::int FROM erp_customers WHERE primary_cnae IS NULL AND cnae_enrichment_error IS NOT NULL) AS cnae_enrichment_failures,
      (SELECT count(*)::int FROM route_regions WHERE source_batch_id IS NOT NULL) AS synced_regions,
      (SELECT count(*)::int FROM region_cities WHERE source_name='google_sheet_varejo') AS mapped_cities,
      (SELECT max(completed_at) FROM import_batches WHERE status='completed') AS last_sync,
      (SELECT status FROM discovery_runs ORDER BY started_at DESC LIMIT 1) AS discovery_status,
      (SELECT snapshot_date FROM discovery_runs ORDER BY started_at DESC LIMIT 1) AS discovery_snapshot,
      (SELECT completed_at FROM discovery_runs ORDER BY started_at DESC LIMIT 1) AS discovery_completed_at`);
    res.json({ ...result.rows[0], ...visits.rows[0], ...operational.rows[0] });
  } catch (error) { next(error); }
});

app.get('/api/prospects', async (req, res, next) => {
  try {
    const values = [];
    const where = ["status <> 'do_not_contact'"];
    if (req.query.q) { values.push(`%${req.query.q}%`); where.push(`(company_name ILIKE $${values.length} OR city ILIKE $${values.length} OR cnpj ILIKE $${values.length})`); }
    if (req.query.priority) { values.push(req.query.priority); where.push(`priority = $${values.length}`); }
    const result = await query(`SELECT p.id, p.company_name, p.trade_name, p.cnpj, p.primary_cnae, p.cnae_description,
      segment, city, state, address, latitude, longitude, status, priority, score, confidence, potential_min, potential_max,
      product_families, score_reasons, source_name, assigned_to, p.updated_at,
      macro.name AS macro_segment, micro.name AS micro_segment
      FROM prospects p
      LEFT JOIN macro_segments macro ON macro.id=p.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=p.micro_segment_id
      WHERE ${where.join(' AND ')} ORDER BY score DESC, p.updated_at DESC LIMIT 500`, values);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/customers', async (req, res, next) => {
  try {
    const term = String(req.query.q || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const values = [];
    const where = [];
    if (term) {
      values.push(`%${term}%`);
      where.push(`(c.company_name ILIKE $${values.length} OR c.customer_code ILIKE $${values.length}
        OR coalesce(c.cnpj,'') ILIKE $${values.length} OR coalesce(c.city,'') ILIKE $${values.length})`);
    }
    values.push(limit);
    const result = await query(`SELECT c.id,c.customer_code,c.cnpj,c.company_name,c.trade_name,c.primary_cnae,
      c.primary_cnae_description,macro.name AS macro_segment,micro.name AS micro_segment,
      c.city,c.state,c.address,c.days_since_last_sale,c.purchase_age_band,c.seller_name,m.latitude,m.longitude,
      CASE WHEN lower(coalesce(c.purchase_age_band,''))='sem venda' THEN 'inactive'
        WHEN c.days_since_last_sale < 90 THEN 'active'
        WHEN c.days_since_last_sale >= 90 THEN 'inactive' ELSE 'unknown' END AS portfolio_status
      FROM erp_customers c
      LEFT JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(c.city)) AND m.state=c.state
      LEFT JOIN macro_segments macro ON macro.id=c.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=c.micro_segment_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE WHEN c.days_since_last_sale < 90 THEN 0 ELSE 1 END,c.company_name
      LIMIT $${values.length}`, values);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/customers/map', async (req, res, next) => {
  try {
    const regionId = req.query.regionId ? String(req.query.regionId) : null;
    const radiusKm = Math.min(250, Math.max(10, Number(req.query.radiusKm) || 50));
    const limit = Math.min(25000, Math.max(100, Number(req.query.limit) || 12000));
    const values = [];
    let coverageJoin;
    if (regionId) {
      values.push(regionId, radiusKm);
      coverageJoin = `JOIN route_regions rr ON rr.id=$1
        JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(c.city)) AND m.state=c.state
          AND 6371 * acos(least(1,greatest(-1,
            cos(radians(rr.hub_latitude::double precision))*cos(radians(m.latitude::double precision))*
            cos(radians(m.longitude::double precision)-radians(rr.hub_longitude::double precision))+
            sin(radians(rr.hub_latitude::double precision))*sin(radians(m.latitude::double precision))))) <= $2`;
    } else {
      coverageJoin = `JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(c.city)) AND m.state=c.state
        WHERE EXISTS (SELECT 1 FROM region_cities rc
          WHERE lower(btrim(rc.city))=lower(btrim(c.city)) AND rc.state=c.state)`;
    }
    values.push(limit);
    const result = await query(`SELECT c.id,c.customer_code,c.cnpj,c.company_name,c.trade_name,c.primary_cnae,
      c.primary_cnae_description,macro.name AS macro_segment,micro.name AS micro_segment,
      c.city,c.state,c.address,c.days_since_last_sale,c.purchase_age_band,c.seller_name,m.latitude,m.longitude,
      CASE WHEN lower(coalesce(c.purchase_age_band,''))='sem venda' THEN 'inactive'
        WHEN c.days_since_last_sale < 90 THEN 'active'
        WHEN c.days_since_last_sale >= 90 THEN 'inactive' ELSE 'unknown' END AS portfolio_status
      FROM erp_customers c
      LEFT JOIN macro_segments macro ON macro.id=c.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=c.micro_segment_id
      ${coverageJoin}
      ORDER BY CASE WHEN c.days_since_last_sale < 90 THEN 0 ELSE 1 END,c.company_name
      LIMIT $${values.length}`, values);
    res.json({ rows: result.rows, limit, truncated: result.rowCount === limit, locationAccuracy: 'municipality_center' });
  } catch (error) { next(error); }
});

app.get('/api/cnaes', async (_req, res, next) => {
  try {
    const result = await query(`SELECT c.cnae,c.description,c.review_status,c.enabled,c.fit_score,
      c.customer_share,c.source_customer_count,c.rationale,c.curation_source,c.reviewed_at,
      c.reviewed_by,c.review_notes,
      count(m.candidate_cnae) FILTER (WHERE m.enabled)::int AS related_count
      FROM prospecting_cnaes c
      LEFT JOIN prospecting_cnae_matches m ON m.seed_cnae=c.cnae
      GROUP BY c.cnae,c.description,c.review_status,c.enabled,c.fit_score,c.customer_share,
        c.source_customer_count,c.rationale,c.curation_source,c.reviewed_at,c.reviewed_by,c.review_notes
      ORDER BY CASE c.review_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        c.fit_score DESC,c.source_customer_count DESC,c.cnae`);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.patch('/api/cnaes/:cnae', async (req, res, next) => {
  try {
    const cnae = String(req.params.cnae || '').replace(/\D/g, '');
    const reviewStatus = String(req.body.reviewStatus || '');
    const reviewNotes = req.body.reviewNotes == null ? null : String(req.body.reviewNotes).trim().slice(0, 500);
    if (cnae.length !== 7) return res.status(400).json({ error: 'CNAE inválido.' });
    if (!['approved', 'rejected', 'pending'].includes(reviewStatus)) {
      return res.status(400).json({ error: 'Decisão de curadoria inválida.' });
    }
    const result = await query(`UPDATE prospecting_cnaes SET review_status=$2,enabled=($2='approved'),
      curation_source='manual',reviewed_at=now(),reviewed_by=$3,review_notes=$4,updated_at=now()
      WHERE cnae=$1 RETURNING *`, [cnae, reviewStatus, req.user.email, reviewNotes]);
    if (!result.rowCount) return res.status(404).json({ error: 'CNAE não encontrado na curadoria.' });
    await query(`INSERT INTO audit_events(actor_email,action,entity_type,entity_id,metadata)
      VALUES ($1,'review_cnae','prospecting_cnae',$2,$3)`,
    [req.user.email, cnae, { reviewStatus, reviewNotes }]);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/segments', async (_req, res, next) => {
  try { res.json(await listSegments()); } catch (error) { next(error); }
});

app.post('/api/segments/reconcile', async (req, res, next) => {
  try {
    const result = await reconcileReferenceSegmentMappings();
    await query(`INSERT INTO audit_events(actor_email,action,entity_type,metadata)
      VALUES ($1,'reconcile_reference_segments','cnae_segment_mapping',$2)`,
    [req.user.email, result]);
    res.json(result);
  } catch (error) { next(error); }
});

app.put('/api/segments/cnae-mappings/:cnae', async (req, res, next) => {
  try {
    const cnae = String(req.params.cnae || '').replace(/\D/g, '');
    const microSegmentId = Number(req.body.microSegmentId);
    if (!/^\d{7}$/.test(cnae)) return res.status(400).json({ error: 'CNAE deve conter 7 dígitos.' });
    if (!Number.isSafeInteger(microSegmentId) || microSegmentId < 1) {
      return res.status(400).json({ error: 'Selecione um microssegmento válido.' });
    }
    res.json(await reviewCnaeSegment({ cnae, microSegmentId, actorEmail: req.user.email }));
  } catch (error) { next(error); }
});

app.get('/api/enrichment/cnae/status', async (_req, res, next) => {
  try {
    const result = await query(`SELECT
      count(*) FILTER (WHERE company.company_id IS NOT NULL AND company.source_name<>'erp_existing')::int AS enriched,
      count(*) FILTER (WHERE (company.company_id IS NULL OR company.source_name='erp_existing')
        AND customer.cnpj IS NOT NULL
        AND length(regexp_replace(customer.cnpj,'\\D','','g'))=14
        AND customer.cnae_enrichment_error IS NULL)::int AS pending,
      count(*) FILTER (WHERE (company.company_id IS NULL OR company.source_name='erp_existing')
        AND customer.cnae_enrichment_error IS NOT NULL)::int AS failed,
      count(*) FILTER (WHERE (company.company_id IS NULL OR company.source_name='erp_existing')
        AND (customer.cnpj IS NULL OR length(regexp_replace(customer.cnpj,'\\D','','g'))<>14))::int AS missing_cnpj
      FROM erp_customers customer
      LEFT JOIN company_cnaes company ON company.company_id=customer.id`);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.post('/api/enrichment/cnae', async (req, res, next) => {
  try {
    const limit = req.body.limit == null ? 5 : Number(req.body.limit);
    const result = await enrichCustomersCnae({
      limit,
      retryErrors: req.body.retryErrors === true,
      actorEmail: req.user.email,
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get('/api/prospects/nearby', async (req, res, next) => {
  try {
    const latitude = Number(req.query.lat), longitude = Number(req.query.lng);
    const requestedRadius = Number(req.query.radiusKm || 50);
    const radiusKm = Math.min(250, Math.max(1, Number.isFinite(requestedRadius) ? requestedRadius : 50));
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas.' });
    }
    const result = await query(`WITH located AS (
      SELECT id, company_name, trade_name, cnpj, segment, city, state, address, latitude, longitude, status, priority,source_name,
        score, confidence, potential_min, potential_max, product_families, score_reasons,
        6371 * acos(least(1, greatest(-1,
          cos(radians($1)) * cos(radians(latitude::double precision)) *
          cos(radians(longitude::double precision) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude::double precision))
        ))) AS distance_km
      FROM prospects
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND status NOT IN ('won','lost','do_not_contact')
    ) SELECT * FROM located WHERE distance_km <= $3 ORDER BY distance_km, score DESC LIMIT 500`,
    [latitude, longitude, radiusKm]);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/prospects', async (req, res, next) => {
  try {
    const { companyName, cnpj, segment, city, state, postalCode, address, priority = 'medium', notes } = req.body;
    if (!companyName) return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
    const normalizedCnpj = cnpj ? String(cnpj).replace(/\D/g, '') : null;
    if (normalizedCnpj && normalizedCnpj.length !== 14) return res.status(400).json({ error: 'CNPJ inválido.' });
    const municipality = city && state ? findMunicipality(city, state) : null;
    const result = await query(`INSERT INTO prospects
      (company_name, cnpj, segment, city, state, postal_code, address, latitude, longitude,
       priority, source_name, score_reasons)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'cadastro manual',$11) RETURNING *`,
    [companyName, normalizedCnpj, segment, city, state?.toUpperCase(), postalCode, address,
      municipality?.latitude, municipality?.longitude, priority,
      JSON.stringify(notes ? [notes, 'Coordenada aproximada do centro do município'] : ['Incluído manualmente pela equipe', 'Coordenada aproximada do centro do município'])]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/lookup/cep/:cep', async (req, res, next) => {
  try { res.json(await lookupCep(req.params.cep)); } catch (error) { next(error); }
});

app.get('/api/lookup/cnpj/:cnpj', async (req, res, next) => {
  try { res.json(await lookupCnpj(req.params.cnpj)); } catch (error) { next(error); }
});

app.get('/api/visits', async (_req, res, next) => {
  try {
    const result = await query(`SELECT id, prospect_id, company_name, city, seller_name,
      visited_at, result, next_action, notes FROM visits ORDER BY visited_at DESC LIMIT 250`);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/visits', async (req, res, next) => {
  try {
    const { prospectId, companyName, city, sellerName, result, nextAction, notes } = req.body;
    if (!companyName || !result) return res.status(400).json({ error: 'Empresa e resultado são obrigatórios.' });
    const inserted = await query(`INSERT INTO visits
      (prospect_id, company_name, city, seller_name, result, next_action, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [prospectId || null, companyName, city, sellerName || req.user.email, result, nextAction, notes]);
    res.status(201).json(inserted.rows[0]);
  } catch (error) { next(error); }
});

app.post('/api/imports', upload.single('file'), async (req, res, next) => {
  try {
    const sourceType = req.body.sourceType;
    if (!['erp', 'routes', 'candidates'].includes(sourceType)) return res.status(400).json({ error: 'Origem inválida.' });
    if (!req.file && !req.body.googleSheetUrl) return res.status(400).json({ error: 'Envie um arquivo .xlsx ou informe um link do Google Sheets.' });
    if (req.file && !req.file.originalname.toLowerCase().endsWith('.xlsx')) return res.status(400).json({ error: 'Somente arquivos .xlsx são aceitos.' });
    const source = req.file || await downloadGoogleSpreadsheet(req.body.googleSheetUrl);
    const sourceBuffer = source.buffer;
    const sourceName = req.file?.originalname || source.fileName;
    const isRetailMatrix = sourceType === 'routes' && (req.body.sheetName || '').trim().toLowerCase() === 'varejo';
    const parsed = isRetailMatrix
      ? await parseRetailRouteMatrix(sourceBuffer, req.body.sheetName)
      : await parseWorkbook(sourceBuffer, req.body.sheetName || undefined);
    const client = await getPool().connect();
    try {
      const summary = await persistImport(client, {
        sourceType, fileName: sourceName, requestedSheet: req.body.sheetName,
        parsed, actorEmail: req.user.email,
      });
      res.status(201).json(summary);
    } finally { client.release(); }
  } catch (error) { next(error); }
});

app.post('/api/sync/google-sheet', async (req, res, next) => {
  try {
    const googleSheetUrl = req.body.googleSheetUrl || process.env.GOOGLE_SHEET_URL || defaultGoogleSheetUrl;
    const results = await syncGoogleSheet({
      googleSheetUrl,
      actorEmail: req.user.email,
      includeCustomers: req.body.includeCustomers !== false,
    });
    res.status(201).json({ results });
  } catch (error) { next(error); }
});

app.get('/api/imports', async (_req, res, next) => {
  try {
    const result = await query(`SELECT id, source_type, file_name, sheet_name, status,
      total_rows, accepted_rows, rejected_rows, detected_fields, created_by, created_at, completed_at
      FROM import_batches ORDER BY created_at DESC LIMIT 50`);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/regions', async (req, res, next) => {
  try {
    const requestedRadius = Number(req.query.radiusKm || 50);
    const radiusKm = Math.min(500, Math.max(1, Number.isFinite(requestedRadius) ? requestedRadius : 50));
    const [regionsResult, citiesResult, municipalitiesResult, prospectsResult] = await Promise.all([
      query(`SELECT id, name, hub_city, hub_state, hub_latitude, hub_longitude, default_radius_km,
        seller_name, specialist_name, corporate_contact, construction_contact, source_label, updated_at
        FROM route_regions ORDER BY name`),
      query(`SELECT region_id, city_key, city, state, latitude, longitude, distance_from_hub_km, coverage_type
        FROM region_cities ORDER BY city`),
      query(`SELECT city_key, city, state, latitude, longitude FROM municipalities
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL`),
      query(`SELECT id, company_name, city, state, latitude, longitude FROM prospects
        WHERE status NOT IN ('won','lost','do_not_contact')`),
    ]);
    const regions = regionsResult.rows.map((region) => {
      const found = new Map();
      for (const city of citiesResult.rows.filter((item) => item.region_id === region.id)) {
        const distance = city.distance_from_hub_km == null ? null : Number(city.distance_from_hub_km);
        if (distance == null || distance <= radiusKm) found.set(`${city.city_key}|${city.state}`, { ...city, distanceKm: distance, source: city.coverage_type });
      }
      for (const city of municipalitiesResult.rows) {
        const distance = haversineKm(region.hub_latitude, region.hub_longitude, city.latitude, city.longitude);
        if (distance != null && distance <= radiusKm) {
          const key = `${city.city_key}|${city.state}`;
          if (!found.has(key)) found.set(key, { ...city, distanceKm: Number(distance.toFixed(1)), source: 'radius' });
        }
      }
      const normalizedCity = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const matchingProspects = prospectsResult.rows.filter((prospect) => {
        const key = `${normalizedCity(prospect.city)}|${prospect.state}`;
        if (found.has(key)) return true;
        const distance = haversineKm(region.hub_latitude, region.hub_longitude, prospect.latitude, prospect.longitude);
        return distance != null && distance <= radiusKm;
      });
      return {
        id: region.id, name: region.name, hubCity: region.hub_city, hubState: region.hub_state,
        hubLatitude: region.hub_latitude, hubLongitude: region.hub_longitude,
        defaultRadiusKm: region.default_radius_km, radiusKm,
        sellerName: region.seller_name, specialistName: region.specialist_name,
        corporateContact: region.corporate_contact, constructionContact: region.construction_contact,
        sourceLabel: region.source_label, updatedAt: region.updated_at,
        canExpandByRadius: region.hub_latitude != null && region.hub_longitude != null,
        prospectCount: matchingProspects.length,
        prospectIds: matchingProspects.slice(0, 500).map((prospect) => prospect.id),
        cities: [...found.values()].sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999) || a.city.localeCompare(b.city)),
      };
    });
    res.json(regions);
  } catch (error) { next(error); }
});

app.get('/api/route-candidates', async (req, res, next) => {
  try {
    const term = String(req.query.q || '').trim();
    if (term.length < 2) return res.status(400).json({ error: 'Informe ao menos 2 caracteres para pesquisar.' });
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
    const result = await query(`SELECT * FROM (
      SELECT c.id::text AS entity_id,c.id AS customer_id,NULL::uuid AS prospect_id,'customer'::text AS kind,
        c.company_name,c.trade_name,c.cnpj,c.address,c.city,c.state,m.latitude,m.longitude,
        CASE WHEN lower(coalesce(c.purchase_age_band,''))='sem venda' OR c.days_since_last_sale>=90
          THEN 'inactive' ELSE 'unknown' END AS portfolio_status,
        NULL::text AS status,macro.name AS macro_segment,micro.name AS micro_segment,
        'municipality_center'::text AS location_accuracy
      FROM erp_customers c
      LEFT JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(c.city)) AND m.state=c.state
      LEFT JOIN macro_segments macro ON macro.id=c.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=c.micro_segment_id
      WHERE (c.company_name ILIKE $1 OR coalesce(c.trade_name,'') ILIKE $1
        OR coalesce(c.customer_code,'') ILIKE $1 OR coalesce(c.cnpj,'') ILIKE $1
        OR coalesce(c.city,'') ILIKE $1)
      UNION ALL
      SELECT p.id::text AS entity_id,NULL::uuid AS customer_id,p.id AS prospect_id,'prospect'::text AS kind,
        p.company_name,p.trade_name,p.cnpj,p.address,p.city,p.state,
        coalesce(p.latitude,m.latitude) AS latitude,coalesce(p.longitude,m.longitude) AS longitude,
        NULL::text AS portfolio_status,p.status,macro.name AS macro_segment,micro.name AS micro_segment,
        CASE WHEN p.latitude IS NULL OR p.longitude IS NULL THEN 'municipality_center' ELSE 'company' END AS location_accuracy
      FROM prospects p
      LEFT JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(p.city)) AND m.state=p.state
      LEFT JOIN macro_segments macro ON macro.id=p.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=p.micro_segment_id
      WHERE p.status NOT IN ('won','lost','do_not_contact')
        AND NOT EXISTS (SELECT 1 FROM erp_customers c WHERE c.cnpj=p.cnpj AND c.cnpj IS NOT NULL)
        AND (p.company_name ILIKE $1 OR coalesce(p.trade_name,'') ILIKE $1
          OR coalesce(p.cnpj,'') ILIKE $1 OR coalesce(p.city,'') ILIKE $1)
    ) candidates
    ORDER BY CASE kind WHEN 'prospect' THEN 0 ELSE 1 END,company_name
    LIMIT $2`, [`%${term}%`, limit]);
    res.json(result.rows.map(routeCandidateFromRow));
  } catch (error) { next(error); }
});

app.post('/api/routes/suggestions', async (req, res, next) => {
  try {
    const origin = normalizeRouteEndpoint(req.body.origin, 'Ponto de saída');
    const destination = normalizeRouteEndpoint(req.body.destination, 'Ponto final');
    if (!origin || !destination) {
      return res.status(400).json({ error: 'Informe ponto de saída e ponto final com cidade/UF ou coordenadas.' });
    }
    const requestedRadius = req.body.corridorKm == null ? 15 : Number(req.body.corridorKm);
    if (!Number.isFinite(requestedRadius) || requestedRadius < 1 || requestedRadius > 50) {
      return res.status(400).json({ error: 'A área do trajeto deve estar entre 1 e 50 km.' });
    }
    const requestedLimit = req.body.maxStops == null ? 20 : Number(req.body.maxStops);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
      return res.status(400).json({ error: 'O limite deve estar entre 1 e 50 paradas.' });
    }
    const result = await query(`SELECT * FROM (
      SELECT c.id::text AS entity_id,c.id AS customer_id,NULL::uuid AS prospect_id,'customer'::text AS kind,
        c.company_name,c.trade_name,c.cnpj,c.address,c.city,c.state,m.latitude,m.longitude,
        'inactive'::text AS portfolio_status,NULL::text AS status,
        macro.name AS macro_segment,micro.name AS micro_segment,'municipality_center'::text AS location_accuracy
      FROM erp_customers c
      JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(c.city)) AND m.state=c.state
      LEFT JOIN macro_segments macro ON macro.id=c.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=c.micro_segment_id
      WHERE (lower(coalesce(c.purchase_age_band,''))='sem venda' OR c.days_since_last_sale>=90)
      UNION ALL
      SELECT p.id::text AS entity_id,NULL::uuid AS customer_id,p.id AS prospect_id,'prospect'::text AS kind,
        p.company_name,p.trade_name,p.cnpj,p.address,p.city,p.state,
        coalesce(p.latitude,m.latitude) AS latitude,coalesce(p.longitude,m.longitude) AS longitude,
        NULL::text AS portfolio_status,p.status,macro.name AS macro_segment,micro.name AS micro_segment,
        CASE WHEN p.latitude IS NULL OR p.longitude IS NULL THEN 'municipality_center' ELSE 'company' END AS location_accuracy
      FROM prospects p
      LEFT JOIN municipalities m ON lower(btrim(m.city))=lower(btrim(p.city)) AND m.state=p.state
      LEFT JOIN macro_segments macro ON macro.id=p.macro_segment_id
      LEFT JOIN micro_segments micro ON micro.id=p.micro_segment_id
      WHERE p.status NOT IN ('won','lost','do_not_contact')
        AND NOT EXISTS (SELECT 1 FROM erp_customers c WHERE c.cnpj=p.cnpj AND c.cnpj IS NOT NULL)
    ) candidates
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL`);
    const suggestions = result.rows.flatMap((row) => {
      const position = distanceToRouteKm(row, origin, destination);
      if (!position || position.distanceKm > requestedRadius) return [];
      return [{ ...routeCandidateFromRow(row),
        distanceFromRouteKm: Number(position.distanceKm.toFixed(1)),
        alongRouteKm: Number(position.alongRouteKm.toFixed(1)) }];
    }).sort((left, right) => {
      const kindOrder = (left.kind === 'prospect' ? 0 : 1) - (right.kind === 'prospect' ? 0 : 1);
      return kindOrder || left.alongRouteKm - right.alongRouteKm
        || left.distanceFromRouteKm - right.distanceFromRouteKm;
    }).slice(0, requestedLimit);
    res.json({
      origin,
      destination,
      corridorKm: requestedRadius,
      maxStops: requestedLimit,
      locationAccuracy: 'municipality_center',
      suggestions,
    });
  } catch (error) { next(error); }
});

app.post('/api/routes', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const { name, routeDate, sellerName, regionId, stops = [] } = req.body;
    if (!name || !routeDate || !Array.isArray(stops) || !stops.length) return res.status(400).json({ error: 'Nome, data e ao menos uma parada são obrigatórios.' });
    if (stops.length > 50) return res.status(400).json({ error: 'Uma rota pode ter no máximo 50 paradas.' });
    const origin = normalizeRouteEndpoint(req.body.origin, 'Ponto de saída');
    const destination = normalizeRouteEndpoint(req.body.destination, 'Ponto final');
    const orderedStops = orderStopsByProximity(stops, origin, destination);
    await client.query('BEGIN');
    const route = await client.query(`INSERT INTO planned_routes
      (name, route_date, seller_name, region_id, status, created_by,
       origin_name,origin_city,origin_state,origin_latitude,origin_longitude,
       destination_name,destination_city,destination_state,destination_latitude,destination_longitude)
      VALUES ($1,$2,$3,$4,'ready',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [name, routeDate, sellerName, regionId || null, req.user.email,
      origin?.name || null, origin?.city || null, origin?.state || null, origin?.latitude ?? null, origin?.longitude ?? null,
      destination?.name || null, destination?.city || null, destination?.state || null,
      destination?.latitude ?? null, destination?.longitude ?? null]);
    for (const [index, stop] of orderedStops.entries()) {
      if (!stop.companyName) throw new Error(`A parada ${index + 1} não possui empresa.`);
      await client.query(`INSERT INTO route_stops
        (route_id, sequence_number, prospect_id, customer_id, company_name, address, city, state,
         latitude, longitude, appointment_at, planned_duration_minutes, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
        route.rows[0].id, index + 1, stop.prospectId || null, stop.customerId || null,
        stop.companyName, stop.address, stop.city, stop.state, stop.latitude, stop.longitude,
        stop.appointmentAt || null, stop.plannedDurationMinutes || 30, stop.notes,
      ]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: route.rows[0].id });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Falha ao reverter a criação da rota:', rollbackError);
    }
    next(error);
  } finally { client.release(); }
});

app.get('/api/routes/:routeId/navigation', async (req, res, next) => {
  try {
    const routeResult = await query('SELECT * FROM planned_routes WHERE id=$1', [req.params.routeId]);
    if (!routeResult.rowCount) return res.status(404).json({ error: 'Rota não encontrada.' });
    const stopsResult = await query(`SELECT * FROM route_stops WHERE route_id=$1 ORDER BY sequence_number`, [req.params.routeId]);
    const stops = stopsResult.rows.map((stop) => ({ ...stop, wazeUrl: buildWazeUrl(stop) }));
    res.json({ route: routeResult.rows[0], stops, ...buildRouteShare(routeResult.rows[0], stops) });
  } catch (error) { next(error); }
});

app.get('/login.html', (_req, res) => res.sendFile(path.join(root, 'dist', 'login.html')));
app.get('/login.js', (_req, res) => res.sendFile(path.join(root, 'dist', 'login.js')));
app.get('/styles.css', (_req, res) => res.sendFile(path.join(root, 'dist', 'styles.css')));
app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules', 'leaflet', 'dist'), { maxAge: '30d' }));
app.use('/vendor/maplibre', express.static(path.join(root, 'node_modules', 'maplibre-gl', 'dist'), { maxAge: '30d' }));
app.use('/vendor/maplibre-leaflet', express.static(path.join(root, 'node_modules', '@maplibre', 'maplibre-gl-leaflet', 'dist'), { maxAge: '30d' }));
app.get('/assets/logo-grupo-abr-branca.svg', (_req, res) => res.sendFile(path.join(root, 'dist', 'assets', 'logo-grupo-abr-branca.svg')));
app.get('/app.js', requirePageAuth, (_req, res) => res.sendFile(path.join(root, 'dist', 'app.js'), {
  headers: { 'Cache-Control': 'no-store, max-age=0' },
}));
app.get('/', requirePageAuth, (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html'), {
  headers: { 'Cache-Control': 'no-store, max-age=0' },
}));
app.use(requirePageAuth, express.static(path.join(root, 'dist'), { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo maior que 30 MB.' });
  if (error.code === '23505') return res.status(409).json({ error: 'Já existe um registro com esse identificador.' });
  const status = Number(error.status) || 500;
  res.status(status).json({ error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Serviço temporariamente indisponível.' : error.message });
});

const port = Number(process.env.PORT || 3000);

await migrate();
const server = app.listen(port, '0.0.0.0', () => console.log(`Radar Comercial ouvindo em 0.0.0.0:${port}`));

if (process.env.GOOGLE_SHEET_URL && process.env.AUTO_SYNC_GOOGLE_SHEET !== 'false') {
  setTimeout(() => syncGoogleSheet({
    googleSheetUrl: process.env.GOOGLE_SHEET_URL,
    actorEmail: 'sincronizacao@grupoabr.com.br',
    includeCustomers: process.env.AUTO_SYNC_CUSTOMERS !== 'false',
  }).then((results) => console.log('Google Sheets sincronizado:', results.map((item) => `${item.sheetName}=${item.accepted}`).join(', ')))
    .catch((error) => console.error('Falha na sincronização do Google Sheets:', error)), 1000);
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
