#!/usr/bin/env python3
"""Descobre prospects nas cidades das rotas usando os Dados Abertos do CNPJ/RFB."""

from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import sqlite3
import tempfile
import time
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path
from uuid import UUID
from urllib.parse import quote, unquote, urlparse
from xml.etree import ElementTree

import psycopg
import requests
import certifi

if __package__:
    from scripts.cnae_curation import assess_cnae
    from scripts.cnae_utils import matches_reference, normalized, secondary_cnae_codes, valid_cnae
else:
    from cnae_curation import assess_cnae
    from cnae_utils import matches_reference, normalized, secondary_cnae_codes, valid_cnae


RFB_HOST = "https://arquivos.receitafederal.gov.br"
RFB_WEBDAV = f"{RFB_HOST}/public.php/webdav"
SOURCE_NAME = "Receita Federal - Dados Abertos CNPJ"
PROSPECT_SOURCE_NAME = "Descoberta por CNAE/Lookalike"
ESTABLISHMENT_FILES = [f"Estabelecimentos{i}.zip" for i in range(10)]
COMPANY_FILES = [f"Empresas{i}.zip" for i in range(10)]


def clean_cnpj(value: str | None) -> str:
    return re.sub(r"[^0-9A-Z]", "", (value or "").upper())

def webdav(session: requests.Session, token: str, path: str = "", depth: int = 1) -> requests.Response:
    url = f"{RFB_WEBDAV}/{quote(path.strip('/'), safe='/')}" if path else RFB_WEBDAV
    for attempt in range(1, 6):
        try:
            response = session.request("PROPFIND", url, auth=(token, ""),
                                       headers={"Depth": str(depth)}, timeout=180)
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status is not None and status < 500 and status != 429:
                raise RuntimeError(f"Recurso da Receita Federal indisponivel ({status}): {url}") from error
            if attempt == 5:
                raise RuntimeError(f"Receita Federal indisponivel apos 5 tentativas: {error}") from error
            wait = attempt * 15
            print(f"Consulta de competencia indisponivel; nova tentativa em {wait}s ({attempt + 1}/5).", flush=True)
            time.sleep(wait)
    raise RuntimeError("Falha inesperada ao consultar competencias da Receita Federal.")


def list_webdav(session: requests.Session, token: str, path: str = "") -> list[str]:
    root = ElementTree.fromstring(webdav(session, token, path).content)
    names = []
    for href in root.findall(".//{DAV:}href"):
        name = Path(unquote(urlparse(href.text or "").path.rstrip("/"))).name
        if name and name != Path(path).name:
            names.append(name)
    return sorted(set(names))


def latest_snapshot(session: requests.Session, token: str) -> str:
    requested = os.getenv("RFB_SNAPSHOT", "").strip()
    if requested:
        if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", requested):
            raise ValueError("RFB_SNAPSHOT deve estar no formato AAAA-MM.")
        return requested
    today = date.today()
    month_index = today.year * 12 + today.month - 1
    for offset in range(12):
        candidate_index = month_index - offset
        candidate = f"{candidate_index // 12:04d}-{candidate_index % 12 + 1:02d}"
        try:
            webdav(session, token, candidate, depth=0)
            print(f"Competencia disponivel encontrada diretamente: {candidate}", flush=True)
            return candidate
        except RuntimeError as error:
            print(f"Competencia {candidate} indisponivel: {error}", flush=True)
    raise RuntimeError("Nenhuma competencia mensal recente foi encontrada na Receita Federal.")


def download(session: requests.Session, token: str, snapshot: str, filename: str, target: Path) -> None:
    url = f"{RFB_WEBDAV}/{snapshot}/{filename}"
    print(f"Baixando {snapshot}/{filename} ...", flush=True)
    partial = target.with_suffix(target.suffix + ".partial")
    for attempt in range(1, 6):
        downloaded = partial.stat().st_size if partial.exists() else 0
        headers = {"Range": f"bytes={downloaded}-"} if downloaded else {}
        try:
            with session.get(url, auth=(token, ""), headers=headers, stream=True, timeout=(60, 900)) as response:
                response.raise_for_status()
                if downloaded and response.status_code == 206:
                    content_range = response.headers.get("Content-Range", "")
                    if not content_range.startswith(f"bytes {downloaded}-"):
                        partial.unlink(missing_ok=True)
                        raise RuntimeError(f"Resposta de retomada inválida para {filename}.")
                append = downloaded > 0 and response.status_code == 206
                with partial.open("ab" if append else "wb") as output:
                    for chunk in response.iter_content(4 * 1024 * 1024):
                        if chunk:
                            output.write(chunk)
            partial.replace(target)
            if filename.lower().endswith(".zip") and not zipfile.is_zipfile(target):
                target.unlink(missing_ok=True)
                partial.unlink(missing_ok=True)
                if attempt == 5:
                    raise RuntimeError(f"O download de {filename} não é um ZIP válido após 5 tentativas.")
                wait = attempt * 10
                print(f"Arquivo ZIP inválido; baixando novamente em {wait}s (tentativa {attempt + 1}/5).", flush=True)
                time.sleep(wait)
                continue
            return
        except (requests.RequestException, OSError, RuntimeError) as error:
            target.unlink(missing_ok=True)
            if attempt == 5:
                raise RuntimeError(f"Falha ao baixar {filename} apos 5 tentativas: {error}") from error
            wait = attempt * 10
            print(f"Download interrompido; retomando em {wait}s (tentativa {attempt + 1}/5).", flush=True)
            time.sleep(wait)


def rows_from_zip(path: Path):
    with zipfile.ZipFile(path) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        if len(members) != 1:
            raise RuntimeError(f"ZIP inesperado: {path.name} contem {len(members)} arquivos.")
        with archive.open(members[0]) as binary:
            with io.TextIOWrapper(binary, encoding="latin-1", newline="") as text:
                yield from csv.reader(text, delimiter=";", quotechar='"')


def read_domain(session: requests.Session, token: str, snapshot: str, filename: str, workdir: Path) -> dict[str, str]:
    target = workdir / filename
    download(session, token, snapshot, filename, target)
    try:
        return {row[0].strip(): row[1].strip() for row in rows_from_zip(target) if len(row) >= 2}
    finally:
        target.unlink(missing_ok=True)


def prepare_stage(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("""CREATE TABLE establishments (
      cnpj TEXT PRIMARY KEY, cnpj_root TEXT NOT NULL, trade_name TEXT, cnae TEXT NOT NULL,
      opened_at TEXT, address TEXT, postal_code TEXT, city TEXT, state TEXT,
      coverage_type TEXT NOT NULL, phone TEXT, email TEXT
    )""")
    db.execute("CREATE INDEX establishments_cnae_idx ON establishments(cnae)")
    db.execute("""CREATE TABLE cnae_targets (
      cnae TEXT PRIMARY KEY, seed_cnae TEXT NOT NULL, match_type TEXT NOT NULL,
      similarity_weight REAL NOT NULL, customer_count INTEGER NOT NULL,
      seed_customer_id TEXT, macro_segment_id INTEGER, micro_segment_id INTEGER
    )""")
    db.execute("""CREATE TABLE establishment_cnaes (
      cnpj TEXT NOT NULL, cnae TEXT NOT NULL, PRIMARY KEY (cnpj,cnae)
    )""")
    db.execute("CREATE INDEX establishment_cnaes_code_idx ON establishment_cnaes(cnae)")
    return db


def score_for(customer_count: int, coverage_type: str, size: str) -> int:
    score = 48 + min(27, round(7 * math.log2(max(1, customer_count))))
    if coverage_type == "current":
        score += 10
    if size in {"03", "05"}:
        score += 5
    return max(1, min(100, score))


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    token = os.environ.get("RFB_SHARE_TOKEN", "YggdBLfdninEJX9").strip()
    max_cnaes = int(os.environ.get("DISCOVERY_MAX_CNAES", "40"))
    min_customers = int(os.environ.get("DISCOVERY_MIN_CUSTOMERS_PER_CNAE", "3"))
    max_prospects = int(os.environ.get("DISCOVERY_MAX_PROSPECTS", "5000"))
    if not database_url:
        raise RuntimeError("DATABASE_URL nao configurada.")

    session = requests.Session()
    session.headers.update({"User-Agent": "Grupo-ABR-Radar-Comercial/1.0 (monthly-public-data-import)"})
    snapshot = latest_snapshot(session, token)
    snapshot_date = date.fromisoformat(f"{snapshot}-01")
    print(f"Competencia selecionada: {snapshot}", flush=True)

    # Use Mozilla's CA bundle while preserving verify-full and hostname validation.
    connect_options = {"sslrootcert": certifi.where()} if "sslmode=verify-full" in database_url else {}
    connect_options.update({"keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 10, "keepalives_count": 5})
    with psycopg.connect(database_url, **connect_options) as pg:
        with pg.cursor() as cursor:
            cursor.execute("SELECT id,cnpj,company_name,trade_name,city,state FROM erp_customers")
            customers = cursor.fetchall()
            known_cnpjs = {clean_cnpj(row[1]) for row in customers if clean_cnpj(row[1])}
            known_roots = {cnpj[:8] for cnpj in known_cnpjs}
            known_name_places = {
                (normalized(company_name), normalized(city), (state or "").upper())
                for _customer_id, _cnpj, company_name, _trade_name, city, state in customers
                if company_name and city and state
            }
            known_name_places.update({
                (normalized(trade_name), normalized(city), (state or "").upper())
                for _customer_id, _cnpj, _company_name, trade_name, city, state in customers
                if trade_name and city and state
            })
            cursor.execute("""SELECT company_id,cnpj,primary_cnae,secondary_cnaes
              FROM company_cnaes""")
            cnaes_by_customer = {}
            customer_cnaes: dict[str, set[str]] = {}
            cnae_counts: Counter = Counter()
            for company_id, cnpj, primary_cnae, secondary_cnaes in cursor.fetchall():
                codes = {code for code in (
                    valid_cnae(primary_cnae),
                    *(valid_cnae(item) for item in (secondary_cnaes or [])),
                ) if code}
                if not codes:
                    continue
                cnaes_by_customer[company_id] = codes
                customer_cnaes[clean_cnpj(cnpj)] = codes
                cnae_counts.update(codes)

            cursor.execute("""SELECT reference.id,reference.reference_name,
                reference.micro_segment_id,micro.macro_segment_id
              FROM segment_reference_companies reference
              JOIN micro_segments micro ON micro.id=reference.micro_segment_id""")
            references = cursor.fetchall()
            customer_names_by_id = {row[0]: row[2] for row in customers}
            reference_segments_by_customer = {}
            for customer in customers:
                customer_id, _cnpj, company_name, trade_name, _city, _state = customer
                matches = [
                    reference for reference in references
                    if matches_reference(company_name, reference[1])
                    or matches_reference(trade_name, reference[1])
                ]
                if matches:
                    reference_segments_by_customer[customer_id] = matches

            if not cnaes_by_customer:
                raise RuntimeError(
                    "A tabela company_cnaes está vazia; enriqueça clientes com a BrasilAPI antes da descoberta."
                )
            if not reference_segments_by_customer:
                raise RuntimeError(
                    "Nenhum cliente da tabela de referência foi reconciliado com o ERP."
                )

            reference_cnae_sources = {}
            reference_cnae_counts: Counter = Counter()
            for customer_id, matches in reference_segments_by_customer.items():
                codes = cnaes_by_customer.get(customer_id, set())
                for cnae in codes:
                    reference_cnae_counts[cnae] += 1
                    for reference_id, _reference_name, micro_id, macro_id in matches:
                        reference_cnae_sources.setdefault(cnae, []).append(
                            (customer_id, macro_id, micro_id, reference_id)
                        )

            customer_segment_updates = []
            for customer_id, matches in reference_segments_by_customer.items():
                pairs = {(item[3], item[2]) for item in matches}
                macro_id, micro_id = next(iter(pairs)) if len(pairs) == 1 else (None, None)
                segment_source = "reference_name" if len(pairs) == 1 else None
                customer_segment_updates.append((macro_id, micro_id, segment_source, customer_id))
            cursor.executemany("""UPDATE erp_customers
              SET macro_segment_id=%s,micro_segment_id=%s,segment_source=%s,updated_at=now()
              WHERE id=%s""", customer_segment_updates)

            mapping_rows = []
            for cnae, sources in reference_cnae_sources.items():
                for customer_id, macro_id, micro_id, reference_id in sources:
                    mapping_rows.append((cnae, macro_id, micro_id, reference_id, customer_id))
            cursor.executemany("""INSERT INTO cnae_segment_mappings
                (cnae_fiscal,macro_segment_id,micro_segment_id,reference_company_id,
                 source_customer_id,review_status,source_name)
              VALUES (%s,%s,%s,%s,%s,'approved','reference_customer_cnae')
              ON CONFLICT(cnae_fiscal,micro_segment_id) DO UPDATE SET
                reference_company_id=coalesce(cnae_segment_mappings.reference_company_id,excluded.reference_company_id),
                source_customer_id=coalesce(cnae_segment_mappings.source_customer_id,excluded.source_customer_id),
                updated_at=now()""", mapping_rows)
            cursor.execute("""SELECT rc.city, rc.state, rc.coverage_type
              FROM region_cities rc JOIN route_regions rr ON rr.id=rc.region_id
              WHERE rc.source_name='google_sheet_varejo'""")
            route_places = {}
            for city, state, coverage in cursor.fetchall():
                key = (normalized(city), state.upper())
                if key not in route_places or coverage == "current":
                    route_places[key] = coverage
            cursor.execute("""INSERT INTO discovery_runs(source_name,snapshot_date,known_customers)
              VALUES (%s,%s,%s) RETURNING id""", (SOURCE_NAME, snapshot_date, len(known_cnpjs)))
            run_id = cursor.fetchone()[0]
        pg.commit()

        try:
            with tempfile.TemporaryDirectory(prefix="radar-cnpj-") as temp:
                workdir = Path(temp)
                municipalities = read_domain(session, token, snapshot, "Municipios.zip", workdir)
                cnae_descriptions = read_domain(session, token, snapshot, "Cnaes.zip", workdir)
                municipality_names = {code: normalized(name) for code, name in municipalities.items()}
                stage = prepare_stage(workdir / "regional.sqlite")

                for filename in ESTABLISHMENT_FILES:
                    target = workdir / filename
                    download(session, token, snapshot, filename, target)
                    batch = []
                    try:
                        for row in rows_from_zip(target):
                            if len(row) < 30:
                                continue
                            cnpj = clean_cnpj("".join(row[:3]))
                            root, cnae = clean_cnpj(row[0]), row[11].strip()
                            if row[5].strip() != "02" or root in known_roots or not cnae:
                                continue
                            place = (municipality_names.get(row[20].strip(), ""), row[19].strip().upper())
                            coverage = route_places.get(place)
                            if not coverage:
                                continue
                            city = municipalities.get(row[20].strip(), "")
                            address = " ".join(part.strip() for part in [row[13], row[14], row[15], row[16], row[17]] if part.strip())
                            phone = "".join(part.strip() for part in [row[21], row[22]] if part.strip())
                            batch.append((cnpj, root, row[4].strip(), cnae, row[10].strip(), address,
                                          row[18].strip(), city, row[19].strip().upper(), coverage, phone, row[27].strip()))
                            establishment_codes = {valid_cnae(cnae), *secondary_cnae_codes(row[12])}
                            establishment_codes.discard(None)
                            stage.executemany(
                                "INSERT OR IGNORE INTO establishment_cnaes VALUES (?,?)",
                                [(cnpj, code) for code in establishment_codes],
                            )
                            if len(batch) >= 5000:
                                stage.executemany("INSERT OR REPLACE INTO establishments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch)
                                stage.commit()
                                batch.clear()
                        if batch:
                            stage.executemany("INSERT OR REPLACE INTO establishments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch)
                            stage.commit()
                    finally:
                        target.unlink(missing_ok=True)

                if not reference_cnae_counts:
                    raise RuntimeError("Nenhum CNAE foi encontrado nos clientes de referência enriquecidos.")
                top_customer_count = cnae_counts.most_common(1)[0][1]
                assessments = [
                    assess_cnae(cnae, cnae_descriptions.get(cnae), count, len(cnaes_by_customer),
                                top_customer_count, min_customers)
                    for cnae, count in reference_cnae_counts.most_common()
                ]

                target_rows = []
                for cnae, customer_count in reference_cnae_counts.most_common(max_cnaes):
                    source_segments = {}
                    for customer_id, macro_id, micro_id, reference_id in reference_cnae_sources[cnae]:
                        pair = (macro_id, micro_id)
                        source_segments.setdefault(pair, []).append((customer_id, reference_id))
                    ranked_segments = sorted(
                        source_segments.items(),
                        key=lambda item: (-len({source[0] for source in item[1]}), item[0]),
                    )
                    seed_customer_id = None
                    macro_id = None
                    micro_id = None
                    if len(ranked_segments) == 1 or (
                        ranked_segments
                        and len({source[0] for source in ranked_segments[0][1]})
                        > len({source[0] for source in ranked_segments[1][1]})
                    ):
                        (macro_id, micro_id), sources = ranked_segments[0]
                        seed_customer_id = sorted(sources, key=lambda source: (str(source[0]), source[1]))[0][0]
                    target_rows.append((
                        cnae, cnae, "exact", 1.0, customer_count,
                        str(seed_customer_id) if seed_customer_id else None, macro_id, micro_id,
                    ))

                with pg.cursor() as cursor:
                    cursor.executemany("""INSERT INTO prospecting_cnaes
                      (cnae,description,enabled,weight,source_customer_count,source_name,review_status,
                       fit_score,customer_share,rationale,curation_source)
                      VALUES (%s,%s,%s,%s,%s,'erp_frequency',%s,%s,%s,%s::jsonb,'heuristic')
                      ON CONFLICT(cnae) DO UPDATE SET description=excluded.description,
                        source_customer_count=excluded.source_customer_count,customer_share=excluded.customer_share,
                        updated_at=now(),
                        enabled=CASE WHEN prospecting_cnaes.curation_source='manual' THEN prospecting_cnaes.enabled ELSE excluded.enabled END,
                        weight=CASE WHEN prospecting_cnaes.curation_source='manual' THEN prospecting_cnaes.weight ELSE excluded.weight END,
                        review_status=CASE WHEN prospecting_cnaes.curation_source='manual' THEN prospecting_cnaes.review_status ELSE excluded.review_status END,
                        fit_score=CASE WHEN prospecting_cnaes.curation_source='manual' THEN prospecting_cnaes.fit_score ELSE excluded.fit_score END,
                        rationale=CASE WHEN prospecting_cnaes.curation_source='manual' THEN prospecting_cnaes.rationale ELSE excluded.rationale END,
                        curation_source=CASE WHEN prospecting_cnaes.curation_source='manual' THEN prospecting_cnaes.curation_source ELSE excluded.curation_source END""",
                      [(item.cnae, item.description, item.review_status == "approved", item.fit_score / 100,
                        item.customer_count, item.review_status, item.fit_score, item.customer_share,
                        json.dumps(item.reasons, ensure_ascii=False)) for item in assessments])
                if not target_rows:
                    raise RuntimeError("Nenhum CNAE de cliente de referência está disponível para prospecção.")

                pg.commit()

                stage.executemany("INSERT OR REPLACE INTO cnae_targets VALUES (?,?,?,?,?,?,?,?,?)", target_rows)
                stage.execute("""DELETE FROM establishments
                  WHERE NOT EXISTS (
                    SELECT 1 FROM establishment_cnaes company_cnae
                    JOIN cnae_targets target ON target.cnae=company_cnae.cnae
                    WHERE company_cnae.cnpj=establishments.cnpj
                  )""")
                stage.commit()
                regional_count = stage.execute("SELECT count(*) FROM establishments").fetchone()[0]

                with pg.cursor() as cursor:
                    cursor.execute("""UPDATE discovery_runs SET matched_customers=%s,target_cnaes=%s,
                      related_cnaes=%s,regional_companies=%s WHERE id=%s""",
                      (len(reference_segments_by_customer), len(target_rows), 0, regional_count, run_id))
                pg.commit()

                selected = stage.execute("""SELECT cnpj,cnpj_root,trade_name,cnae,opened_at,address,
                    postal_code,city,state,coverage_type,phone,email,matched_cnae,seed_cnae,match_type,
                    similarity_weight,customer_count,seed_customer_id,macro_segment_id,micro_segment_id
                  FROM (
                    SELECT e.cnpj,e.cnpj_root,e.trade_name,e.cnae,e.opened_at,e.address,
                      e.postal_code,e.city,e.state,e.coverage_type,e.phone,e.email,
                      t.cnae AS matched_cnae,t.seed_cnae,t.match_type,t.similarity_weight,t.customer_count,
                      t.seed_customer_id,t.macro_segment_id,t.micro_segment_id,
                      ROW_NUMBER() OVER (PARTITION BY e.cnpj
                        ORDER BY (t.similarity_weight*t.customer_count) DESC,
                          t.micro_segment_id NULLS LAST,t.seed_customer_id) AS row_number
                    FROM establishments e
                    JOIN establishment_cnaes company_cnae ON company_cnae.cnpj=e.cnpj
                    JOIN cnae_targets t ON t.cnae=company_cnae.cnae
                  ) matches
                  WHERE row_number=1
                  ORDER BY CASE coverage_type WHEN 'current' THEN 0 ELSE 1 END,
                    (similarity_weight*customer_count) DESC,opened_at DESC LIMIT ?""",
                    (max_prospects,)).fetchall()
                selected_roots = {row[1] for row in selected}
                companies: dict[str, tuple[str, str, str]] = {}
                for filename in COMPANY_FILES:
                    target = workdir / filename
                    download(session, token, snapshot, filename, target)
                    try:
                        for row in rows_from_zip(target):
                            if len(row) >= 6 and clean_cnpj(row[0]) in selected_roots:
                                companies[clean_cnpj(row[0])] = (row[1].strip(), row[5].strip(), row[4].strip())
                    finally:
                        target.unlink(missing_ok=True)

                city_coordinates = {}
                with pg.cursor() as cursor:
                    cursor.execute("SELECT lower(city),state,latitude,longitude FROM municipalities")
                    city_coordinates = {(normalized(city), state): (lat, lon) for city, state, lat, lon in cursor.fetchall()}
                    records = []
                    skipped_by_name = 0
                    for item in selected:
                        (cnpj, root, trade, cnae, opened, address, cep, city, state, coverage, phone, email,
                         matched_cnae, seed_cnae, match_type, similarity_weight, customer_count,
                         seed_customer_id, macro_segment_id, micro_segment_id) = item
                        company_name, size, _capital = companies.get(root, (trade or f"Empresa {cnpj}", "00", "0"))
                        if ((normalized(company_name), normalized(city), state) in known_name_places or
                                (trade and (normalized(trade), normalized(city), state) in known_name_places)):
                            skipped_by_name += 1
                            continue
                        coordinates = city_coordinates.get((normalized(city), state), (None, None))
                        mirror_name = customer_names_by_id.get(seed_customer_id) if seed_customer_id else None
                        cnae_role = "principal" if matched_cnae == valid_cnae(cnae) else "secundário"
                        reasons = [
                            f"CNAE {cnae_role} {matched_cnae} igual ao CNAE de {customer_count} cliente(s) de referência",
                            f"Segmento espelhado de {mirror_name}" if mirror_name and micro_segment_id else
                                "CNAE associado a segmentos de referência ambíguos; classificação requer revisão",
                            f"Empresa ativa em cidade de cobertura {coverage} da rota",
                            "CNPJ nao encontrado na base atual nem em grupo empresarial ja atendido",
                        ]
                        records.append((cnpj, company_name, trade or None, cnae, cnae_descriptions.get(cnae), None, city, state,
                                        cep or None, address or None, coordinates[0], coordinates[1], size or None,
                                        opened or None, snapshot_date,
                                        round(score_for(customer_count, coverage, size) * float(similarity_weight)),
                                        json.dumps(reasons, ensure_ascii=False),
                                        macro_segment_id, micro_segment_id, matched_cnae, seed_customer_id))
                    cursor.executemany("""INSERT INTO prospects
                      (cnpj,company_name,trade_name,primary_cnae,cnae_description,segment,city,state,postal_code,address,
                       latitude,longitude,company_size,opened_at,cadastral_status,source_snapshot_date,source_name,
                       status,priority,score,confidence,score_reasons,macro_segment_id,micro_segment_id,
                       matched_seed_cnae,matched_seed_customer_id)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ATIVA',%s,%s,'review',
                        CASE WHEN %s >= 80 THEN 'high' WHEN %s >= 60 THEN 'medium' ELSE 'low' END,%s,72,%s::jsonb,%s,%s,%s,%s)
                      ON CONFLICT(cnpj) WHERE cnpj IS NOT NULL DO UPDATE SET
                        company_name=excluded.company_name,trade_name=excluded.trade_name,primary_cnae=excluded.primary_cnae,
                        cnae_description=excluded.cnae_description,segment=excluded.segment,city=excluded.city,state=excluded.state,
                        postal_code=excluded.postal_code,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
                        company_size=excluded.company_size,opened_at=excluded.opened_at,cadastral_status=excluded.cadastral_status,
                        source_snapshot_date=excluded.source_snapshot_date,source_name=excluded.source_name,score=excluded.score,
                        priority=excluded.priority,score_reasons=excluded.score_reasons,
                        macro_segment_id=excluded.macro_segment_id,micro_segment_id=excluded.micro_segment_id,
                        matched_seed_cnae=excluded.matched_seed_cnae,
                        matched_seed_customer_id=excluded.matched_seed_customer_id,updated_at=now()""",
                      [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13],
                        r[14], PROSPECT_SOURCE_NAME, r[15], r[15], r[15], r[16], r[17], r[18], r[19],
                        UUID(r[20]) if r[20] else None)
                       for r in records])
                    cursor.execute("""UPDATE discovery_runs SET status='completed',prospects_created=%s,
                      completed_at=now() WHERE id=%s""", (len(records), run_id))
                pg.commit()
                stage.close()
                print(json.dumps({"snapshot": snapshot, "knownCustomers": len(customers),
                                  "matchedCustomers": len(reference_segments_by_customer), "observedCnaes": len(assessments),
                                  "lookalikeCnaes": len(target_rows), "relatedCnaes": 0,
                                  "regionalCompanies": regional_count, "prospectsLoaded": len(records),
                                  "skippedByNameAndCity": skipped_by_name}), flush=True)
        except Exception as error:
            try:
                pg.rollback()
            except psycopg.Error as rollback_error:
                print(f"Nao foi possivel reverter a transacao apos a falha: {rollback_error}", flush=True)
            try:
                with psycopg.connect(database_url, **connect_options) as failure_pg:
                    with failure_pg.cursor() as cursor:
                        cursor.execute("""UPDATE discovery_runs SET status='failed',error_message=%s,
                          completed_at=now() WHERE id=%s""", (str(error)[:2000], run_id))
            except psycopg.Error as logging_error:
                print(f"Nao foi possivel registrar a falha da execucao {run_id}: {logging_error}", flush=True)
            raise


if __name__ == "__main__":
    main()
