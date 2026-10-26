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
import unicodedata
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from xml.etree import ElementTree

import psycopg
import requests

from cnae_curation import assess_cnae, related_cnaes


RFB_HOST = "https://arquivos.receitafederal.gov.br"
RFB_WEBDAV = f"{RFB_HOST}/public.php/webdav"
SOURCE_NAME = "Receita Federal - Dados Abertos CNPJ"
ESTABLISHMENT_FILES = [f"Estabelecimentos{i}.zip" for i in range(10)]
COMPANY_FILES = [f"Empresas{i}.zip" for i in range(10)]


def normalized(value: str | None) -> str:
    text = unicodedata.normalize("NFD", value or "")
    return re.sub(r"[^A-Z0-9]+", " ", "".join(ch for ch in text if not unicodedata.combining(ch)).upper()).strip()


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
                append = downloaded > 0 and response.status_code == 206
                with partial.open("ab" if append else "wb") as output:
                    for chunk in response.iter_content(4 * 1024 * 1024):
                        if chunk:
                            output.write(chunk)
            partial.replace(target)
            return
        except (requests.RequestException, OSError) as error:
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
      similarity_weight REAL NOT NULL, customer_count INTEGER NOT NULL
    )""")
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

    connect_options = {"sslrootcert": "system"} if "sslmode=verify-full" in database_url else {}
    with psycopg.connect(database_url, **connect_options) as pg:
        with pg.cursor() as cursor:
            cursor.execute("SELECT cnpj,company_name,city,state FROM erp_customers")
            customers = cursor.fetchall()
            known_cnpjs = {clean_cnpj(row[0]) for row in customers if clean_cnpj(row[0])}
            known_roots = {cnpj[:8] for cnpj in known_cnpjs}
            known_name_places = {
                (normalized(company_name), normalized(city), (state or "").upper())
                for _cnpj, company_name, city, state in customers if company_name and city and state
            }
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
                customer_cnaes: dict[str, str] = {}
                cnae_counts: Counter = Counter()
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
                            if cnpj in known_cnpjs and cnae:
                                customer_cnaes[cnpj] = cnae
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
                            if len(batch) >= 5000:
                                stage.executemany("INSERT OR REPLACE INTO establishments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch)
                                stage.commit()
                                batch.clear()
                        if batch:
                            stage.executemany("INSERT OR REPLACE INTO establishments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch)
                            stage.commit()
                    finally:
                        target.unlink(missing_ok=True)

                cnae_counts.update(customer_cnaes.values())
                if not cnae_counts:
                    raise RuntimeError("Nenhum CNAE foi encontrado para os CNPJs validos da carteira.")
                top_customer_count = cnae_counts.most_common(1)[0][1]
                assessments = [
                    assess_cnae(cnae, cnae_descriptions.get(cnae), count, len(customer_cnaes),
                                top_customer_count, min_customers)
                    for cnae, count in cnae_counts.most_common()
                ]

                with pg.cursor() as cursor:
                    cursor.executemany("UPDATE erp_customers SET primary_cnae=%s,cnae_source_date=%s WHERE cnpj=%s",
                                       [(cnae, snapshot_date, cnpj) for cnpj, cnae in customer_cnaes.items()])
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
                    cursor.execute("""SELECT cnae,source_customer_count,weight FROM prospecting_cnaes
                      WHERE enabled=true AND review_status='approved'
                      ORDER BY fit_score DESC,source_customer_count DESC,cnae LIMIT %s""", (max_cnaes,))
                    approved_seeds = cursor.fetchall()
                    if not approved_seeds:
                        raise RuntimeError("A curadoria nao aprovou CNAEs; revise os itens pendentes antes da descoberta.")

                    match_rows = []
                    for seed_cnae, customer_count, seed_weight in approved_seeds:
                        for candidate, description, match_type, similarity_weight in related_cnaes(seed_cnae, cnae_descriptions):
                            match_rows.append((seed_cnae, candidate, description, match_type,
                                               float(seed_weight) * similarity_weight, customer_count))
                    cursor.execute("DELETE FROM prospecting_cnae_matches")
                    cursor.executemany("""INSERT INTO prospecting_cnae_matches
                      (seed_cnae,candidate_cnae,candidate_description,match_type,similarity_weight,enabled)
                      VALUES (%s,%s,%s,%s,%s,true)""",
                      [(seed, candidate, description, match_type, weight)
                       for seed, candidate, description, match_type, weight, _count in match_rows])
                pg.commit()

                best_matches = {}
                for seed, candidate, description, match_type, weight, customer_count in match_rows:
                    current = best_matches.get(candidate)
                    if current is None or weight * customer_count > current[3] * current[4]:
                        best_matches[candidate] = (seed, description, match_type, weight, customer_count)
                stage.executemany("INSERT OR REPLACE INTO cnae_targets VALUES (?,?,?,?,?)",
                                  [(candidate, seed, match_type, weight, customer_count)
                                   for candidate, (seed, _description, match_type, weight, customer_count) in best_matches.items()])
                stage.execute("DELETE FROM establishments WHERE NOT EXISTS (SELECT 1 FROM cnae_targets WHERE cnae_targets.cnae=establishments.cnae)")
                stage.commit()
                regional_count = stage.execute("SELECT count(*) FROM establishments").fetchone()[0]

                with pg.cursor() as cursor:
                    cursor.execute("""UPDATE discovery_runs SET matched_customers=%s,target_cnaes=%s,
                      related_cnaes=%s,regional_companies=%s WHERE id=%s""",
                      (len(customer_cnaes), len(approved_seeds), len(best_matches), regional_count, run_id))
                pg.commit()

                selected = stage.execute("""SELECT e.cnpj,e.cnpj_root,e.trade_name,e.cnae,e.opened_at,e.address,
                    e.postal_code,e.city,e.state,e.coverage_type,e.phone,e.email,t.seed_cnae,t.match_type,
                    t.similarity_weight,t.customer_count
                  FROM establishments e JOIN cnae_targets t ON t.cnae=e.cnae
                  ORDER BY CASE e.coverage_type WHEN 'current' THEN 0 ELSE 1 END,
                    (t.similarity_weight * t.customer_count) DESC,e.opened_at DESC LIMIT ?""", (max_prospects,)).fetchall()
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
                         seed_cnae, match_type, similarity_weight, customer_count) = item
                        company_name, size, _capital = companies.get(root, (trade or f"Empresa {cnpj}", "00", "0"))
                        if ((normalized(company_name), normalized(city), state) in known_name_places or
                                (trade and (normalized(trade), normalized(city), state) in known_name_places)):
                            skipped_by_name += 1
                            continue
                        coordinates = city_coordinates.get((normalized(city), state), (None, None))
                        reasons = [
                            (f"CNAE presente em {customer_count} clientes cadastrados no ERP" if match_type == "exact"
                             else f"CNAE da mesma classe economica do CNAE {seed_cnae}, presente em {customer_count} clientes"),
                            f"Empresa ativa em cidade de cobertura {coverage} da rota",
                            "CNPJ nao encontrado na base atual nem em grupo empresarial ja atendido",
                        ]
                        records.append((cnpj, company_name, trade or None, cnae, cnae_descriptions.get(cnae), city, state,
                                        cep or None, address or None, coordinates[0], coordinates[1], size or None,
                                        opened or None, snapshot_date,
                                        round(score_for(customer_count, coverage, size) * float(similarity_weight)),
                                        json.dumps(reasons, ensure_ascii=False)))
                    cursor.executemany("""INSERT INTO prospects
                      (cnpj,company_name,trade_name,primary_cnae,cnae_description,segment,city,state,postal_code,address,
                       latitude,longitude,company_size,opened_at,cadastral_status,source_snapshot_date,source_name,
                       status,priority,score,confidence,score_reasons)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ATIVA',%s,%s,'review',
                        CASE WHEN %s >= 80 THEN 'high' WHEN %s >= 60 THEN 'medium' ELSE 'low' END,%s,72,%s::jsonb)
                      ON CONFLICT(cnpj) WHERE cnpj IS NOT NULL DO UPDATE SET
                        company_name=excluded.company_name,trade_name=excluded.trade_name,primary_cnae=excluded.primary_cnae,
                        cnae_description=excluded.cnae_description,segment=excluded.segment,city=excluded.city,state=excluded.state,
                        postal_code=excluded.postal_code,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
                        company_size=excluded.company_size,opened_at=excluded.opened_at,cadastral_status=excluded.cadastral_status,
                        source_snapshot_date=excluded.source_snapshot_date,source_name=excluded.source_name,score=excluded.score,
                        priority=excluded.priority,score_reasons=excluded.score_reasons,updated_at=now()""",
                      [(r[0], r[1], r[2], r[3], r[4], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12],
                        r[13], SOURCE_NAME, r[14], r[14], r[14], r[15]) for r in records])
                    cursor.execute("""UPDATE discovery_runs SET status='completed',prospects_created=%s,
                      completed_at=now() WHERE id=%s""", (len(records), run_id))
                pg.commit()
                stage.close()
                print(json.dumps({"snapshot": snapshot, "knownCustomers": len(customers),
                                  "matchedCustomers": len(customer_cnaes), "observedCnaes": len(assessments),
                                  "approvedCnaes": len(approved_seeds), "relatedCnaes": len(best_matches),
                                  "regionalCompanies": regional_count, "prospectsLoaded": len(records),
                                  "skippedByNameAndCity": skipped_by_name}), flush=True)
        except Exception as error:
            pg.rollback()
            with pg.cursor() as cursor:
                cursor.execute("UPDATE discovery_runs SET status='failed',error_message=%s,completed_at=now() WHERE id=%s",
                               (str(error)[:2000], run_id))
            pg.commit()
            raise


if __name__ == "__main__":
    main()
