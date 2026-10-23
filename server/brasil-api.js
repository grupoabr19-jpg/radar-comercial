const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 500;

function digits(value) { return String(value || '').replace(/\D/g, ''); }

async function fetchBrasilApi(path) {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.savedAt < TTL_MS) return cached.value;
  const response = await fetch(`https://brasilapi.com.br/api/${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Radar-Comercial-Grupo-ABR/1.0' },
    signal: AbortSignal.timeout(8_000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(value.message || `BrasilAPI indisponível (${response.status}).`);
    error.status = response.status === 404 ? 404 : response.status === 400 ? 400 : 503;
    throw error;
  }
  if (cache.size >= MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value);
  cache.set(path, { savedAt: Date.now(), value });
  return value;
}

export async function lookupCep(value) {
  const cep = digits(value);
  if (cep.length !== 8) { const error = new Error('CEP deve conter 8 dígitos.'); error.status = 400; throw error; }
  const result = await fetchBrasilApi(`cep/v1/${cep}`);
  return { cep: result.cep, state: result.state, city: result.city, neighborhood: result.neighborhood, street: result.street, ibgeCity: result.ibge?.city, source: `BrasilAPI/${result.service || 'CEP'}` };
}

export async function lookupCnpj(value) {
  const cnpj = digits(value);
  if (cnpj.length !== 14) { const error = new Error('CNPJ deve conter 14 dígitos.'); error.status = 400; throw error; }
  const result = await fetchBrasilApi(`cnpj/v1/${cnpj}`);
  return {
    cnpj: result.cnpj, companyName: result.razao_social, tradeName: result.nome_fantasia,
    status: result.descricao_situacao_cadastral, size: result.porte,
    cnae: result.cnae_fiscal, activity: result.cnae_fiscal_descricao,
    postalCode: result.cep, state: result.uf, city: result.municipio,
    address: [result.descricao_tipo_de_logradouro, result.logradouro, result.numero, result.complemento, result.bairro].filter(Boolean).join(', '),
    phone: result.ddd_telefone_1 || null, email: result.email || null,
    ibgeCity: result.codigo_municipio_ibge, source: 'BrasilAPI/CNPJ',
  };
}

