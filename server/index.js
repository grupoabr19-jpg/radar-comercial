import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import { clearSessionCookie, createSession, readSession, requireApiAuth, requirePageAuth, setSessionCookie, verifyPassword } from './auth.js';
import { getPool, query } from './db.js';
import { migrate } from './migrate.js';
import { parseWorkbook, persistImport } from './importer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  const validPassword = await verifyPassword(String(req.body.password || ''), process.env.ADMIN_PASSWORD_HASH);
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

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const result = await query(`SELECT
      count(*) FILTER (WHERE status IN ('new','qualify','review'))::int AS prospects,
      count(*) FILTER (WHERE priority='high' AND status NOT IN ('won','lost','do_not_contact'))::int AS high_priority,
      coalesce(sum(potential_max) FILTER (WHERE status NOT IN ('won','lost','do_not_contact')),0)::numeric AS potential_max
      FROM prospects`);
    const visits = await query(`SELECT count(*)::int AS visits_month FROM visits
      WHERE visited_at >= date_trunc('month', now())`);
    res.json({ ...result.rows[0], ...visits.rows[0] });
  } catch (error) { next(error); }
});

app.get('/api/prospects', async (req, res, next) => {
  try {
    const values = [];
    const where = ["status <> 'do_not_contact'"];
    if (req.query.q) { values.push(`%${req.query.q}%`); where.push(`(company_name ILIKE $${values.length} OR city ILIKE $${values.length} OR cnpj ILIKE $${values.length})`); }
    if (req.query.priority) { values.push(req.query.priority); where.push(`priority = $${values.length}`); }
    const result = await query(`SELECT id, company_name, trade_name, cnpj, segment, city, state,
      address, status, priority, score, confidence, potential_min, potential_max,
      product_families, score_reasons, assigned_to, updated_at
      FROM prospects WHERE ${where.join(' AND ')} ORDER BY score DESC, updated_at DESC LIMIT 500`, values);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/prospects', async (req, res, next) => {
  try {
    const { companyName, cnpj, segment, city, state, priority = 'medium', notes } = req.body;
    if (!companyName) return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
    const normalizedCnpj = cnpj ? String(cnpj).replace(/\D/g, '') : null;
    if (normalizedCnpj && normalizedCnpj.length !== 14) return res.status(400).json({ error: 'CNPJ inválido.' });
    const result = await query(`INSERT INTO prospects
      (company_name, cnpj, segment, city, state, priority, source_name, score_reasons)
      VALUES ($1,$2,$3,$4,$5,$6,'cadastro manual',$7) RETURNING *`,
    [companyName, normalizedCnpj, segment, city, state?.toUpperCase(), priority, JSON.stringify(notes ? [notes] : ['Incluído manualmente pela equipe'])]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
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
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo .xlsx.' });
    if (!req.file.originalname.toLowerCase().endsWith('.xlsx')) return res.status(400).json({ error: 'Somente arquivos .xlsx são aceitos.' });
    const parsed = await parseWorkbook(req.file.buffer, req.body.sheetName || undefined);
    const client = await getPool().connect();
    try {
      const summary = await persistImport(client, {
        sourceType, fileName: req.file.originalname, requestedSheet: req.body.sheetName,
        parsed, actorEmail: req.user.email,
      });
      res.status(201).json(summary);
    } finally { client.release(); }
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

app.get('/login.html', (_req, res) => res.sendFile(path.join(root, 'dist', 'login.html')));
app.get('/login.js', (_req, res) => res.sendFile(path.join(root, 'dist', 'login.js')));
app.get('/styles.css', (_req, res) => res.sendFile(path.join(root, 'dist', 'styles.css')));
app.get('/', requirePageAuth, (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
app.use(requirePageAuth, express.static(path.join(root, 'dist'), { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo maior que 30 MB.' });
  if (error.code === '23505') return res.status(409).json({ error: 'Já existe um registro com esse identificador.' });
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno.' : error.message });
});

const port = Number(process.env.PORT || 3000);

await migrate();
const server = app.listen(port, '0.0.0.0', () => console.log(`Radar Comercial ouvindo em 0.0.0.0:${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

