INSERT INTO route_regions (name, hub_city, hub_state, default_radius_km) VALUES
  ('BRAGANÇA', 'Bragança Paulista', 'SP', 50),
  ('JUNDIAÍ', 'Jundiaí', 'SP', 50),
  ('VARGINHA', 'Varginha', 'MG', 50),
  ('POUSO ALEGRE', 'Pouso Alegre', 'MG', 50),
  ('POÇOS DE CALDAS', 'Poços de Caldas', 'MG', 50),
  ('ITAJUBÁ', 'Itajubá', 'MG', 50),
  ('EXTREMA', 'Extrema', 'MG', 50),
  ('CAMBUÍ', 'Cambuí', 'MG', 50)
ON CONFLICT (name) DO UPDATE SET
  hub_city = EXCLUDED.hub_city,
  hub_state = EXCLUDED.hub_state,
  updated_at = now();

WITH cities(region_name, city, state, is_hub) AS (VALUES
  ('BRAGANÇA','Bragança Paulista','SP',true), ('BRAGANÇA','Atibaia','SP',false),
  ('BRAGANÇA','Piracaia','SP',false), ('BRAGANÇA','Bom Jesus dos Perdões','SP',false),
  ('BRAGANÇA','Joanópolis','SP',false), ('BRAGANÇA','Vargem','SP',false),
  ('BRAGANÇA','Nazaré Paulista','SP',false), ('BRAGANÇA','Mairiporã','SP',false),
  ('JUNDIAÍ','Jundiaí','SP',true), ('JUNDIAÍ','Itatiba','SP',false),
  ('JUNDIAÍ','Jarinu','SP',false), ('JUNDIAÍ','Várzea Paulista','SP',false),
  ('JUNDIAÍ','Campo Limpo Paulista','SP',false), ('JUNDIAÍ','Itupeva','SP',false),
  ('JUNDIAÍ','Cajamar','SP',false), ('JUNDIAÍ','Vinhedo','SP',false),
  ('VARGINHA','Varginha','MG',true), ('VARGINHA','Três Pontas','MG',false),
  ('VARGINHA','Três Corações','MG',false), ('VARGINHA','Elói Mendes','MG',false),
  ('VARGINHA','Paraguaçu','MG',false), ('VARGINHA','Monsenhor Paulo','MG',false),
  ('VARGINHA','Campanha','MG',false), ('VARGINHA','Cambuquira','MG',false),
  ('VARGINHA','São Gonçalo do Sapucaí','MG',false), ('VARGINHA','Careaçu','MG',false),
  ('VARGINHA','Coqueiral','MG',false), ('VARGINHA','Santana da Vargem','MG',false),
  ('POUSO ALEGRE','Pouso Alegre','MG',true), ('POUSO ALEGRE','Jacutinga','MG',false),
  ('POUSO ALEGRE','Borda da Mata','MG',false), ('POUSO ALEGRE','Bueno Brandão','MG',false),
  ('POUSO ALEGRE','Lambari','MG',false), ('POUSO ALEGRE','Caxambu','MG',false),
  ('POUSO ALEGRE','São Lourenço','MG',false), ('POUSO ALEGRE','São Sebastião da Bela Vista','MG',false),
  ('POUSO ALEGRE','Natércia','MG',false), ('POUSO ALEGRE','Heliodora','MG',false),
  ('POUSO ALEGRE','Ouro Fino','MG',false), ('POUSO ALEGRE','Baependi','MG',false),
  ('POUSO ALEGRE','Carmo de Minas','MG',false), ('POUSO ALEGRE','Monte Sião','MG',false),
  ('POUSO ALEGRE','Inconfidentes','MG',false), ('POUSO ALEGRE','Conceição do Rio Verde','MG',false),
  ('POÇOS DE CALDAS','Poços de Caldas','MG',true), ('POÇOS DE CALDAS','Alfenas','MG',false),
  ('POÇOS DE CALDAS','Machado','MG',false), ('POÇOS DE CALDAS','Caldas','MG',false),
  ('POÇOS DE CALDAS','Santa Rita de Caldas','MG',false), ('POÇOS DE CALDAS','Congonhal','MG',false),
  ('POÇOS DE CALDAS','Poço Fundo','MG',false), ('POÇOS DE CALDAS','Silvianópolis','MG',false),
  ('POÇOS DE CALDAS','Fama','MG',false), ('POÇOS DE CALDAS','Andradas','MG',false),
  ('POÇOS DE CALDAS','Ipuiúna','MG',false), ('POÇOS DE CALDAS','Campos Gerais','MG',false),
  ('POÇOS DE CALDAS','Ibitiúra de Minas','MG',false),
  ('ITAJUBÁ','Itajubá','MG',true), ('ITAJUBÁ','Santa Rita do Sapucaí','MG',false),
  ('ITAJUBÁ','Piranguinho','MG',false), ('ITAJUBÁ','Maria da Fé','MG',false),
  ('ITAJUBÁ','Pedralva','MG',false), ('ITAJUBÁ','Virgínia','MG',false),
  ('ITAJUBÁ','Delfim Moreira','MG',false), ('ITAJUBÁ','Gonçalves','MG',false),
  ('ITAJUBÁ','Sapucaí-Mirim','MG',false), ('ITAJUBÁ','São Bento Abade','MG',false),
  ('ITAJUBÁ','Conceição dos Ouros','MG',false), ('ITAJUBÁ','Cachoeira de Minas','MG',false),
  ('ITAJUBÁ','Brasópolis','MG',false), ('ITAJUBÁ','São José do Alegre','MG',false),
  ('ITAJUBÁ','Consolação','MG',false), ('ITAJUBÁ','Paraisópolis','MG',false),
  ('EXTREMA','Extrema','MG',true), ('EXTREMA','Toledo','MG',false),
  ('EXTREMA','Munhoz','MG',false), ('EXTREMA','Pedra Bela','SP',false),
  ('EXTREMA','Pinhalzinho','SP',false), ('EXTREMA','Socorro','SP',false),
  ('EXTREMA','Serra Negra','SP',false),
  ('CAMBUÍ','Cambuí','MG',true), ('CAMBUÍ','Bom Repouso','MG',false),
  ('CAMBUÍ','Senador Amaral','MG',false), ('CAMBUÍ','Estiva','MG',false),
  ('CAMBUÍ','Camanducaia','MG',false), ('CAMBUÍ','Itapeva','MG',false),
  ('CAMBUÍ','Córrego do Bom Jesus','MG',false), ('CAMBUÍ','Monte Verde','MG',false)
)
INSERT INTO region_cities (region_id, city_key, city, state, distance_from_hub_km, source_name)
SELECT rr.id,
  trim(both '-' from regexp_replace(lower(translate(c.city,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '-', 'g')),
  c.city, c.state, CASE WHEN c.is_hub THEN 0 ELSE NULL END, 'google_sheet_varejo'
FROM cities c
JOIN route_regions rr ON rr.name = c.region_name
ON CONFLICT (region_id, city_key, state) DO UPDATE SET
  city = EXCLUDED.city,
  source_name = EXCLUDED.source_name,
  updated_at = now();

