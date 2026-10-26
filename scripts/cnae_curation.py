"""Regras explicáveis para curadoria de CNAEs compradores de aço."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class CnaeAssessment:
    cnae: str
    description: str
    customer_count: int
    customer_share: float
    fit_score: int
    review_status: str
    reasons: tuple[str, ...]


DIVISION_SCORES = {
    "24": (22, "metalurgia e transformação primária de metais"),
    "25": (38, "fabricação de produtos de metal"),
    "27": (15, "fabricação de equipamentos elétricos"),
    "28": (30, "fabricação de máquinas e equipamentos"),
    "29": (20, "fabricação de veículos e componentes"),
    "30": (20, "fabricação de outros equipamentos de transporte"),
    "31": (12, "fabricação de móveis"),
    "33": (27, "manutenção e instalação industrial"),
    "41": (28, "construção de edifícios"),
    "42": (25, "obras de infraestrutura"),
    "43": (25, "serviços especializados para construção"),
}

POSITIVE_RULES = (
    (r"ESTRUTURAS? METAL", 38, "atua com estruturas metálicas"),
    (r"ESQUADRIAS? DE METAL", 38, "fabrica ou instala esquadrias metálicas"),
    (r"SERRALHER", 38, "atividade de serralheria"),
    (r"CALDEIRARIA", 34, "atividade de caldeiraria"),
    (r"ARTEFATOS?.*(FERRO|ACO|METAL)", 32, "fabrica artefatos metálicos"),
    (r"(TUBOS?|PERFIS?|CHAPAS?|TELHAS?).*(ACO|METAL)", 32, "atua com produtos de aço ou metal"),
    (r"(TELHADOS?|COBERTURAS?|CALHAS)", 28, "atua com coberturas, telhados ou calhas"),
    (r"COMERCIO ATACADISTA.*(METAIS|FERRAGENS|MATERIAL DE CONSTRUCAO)", 30, "revende metais, ferragens ou materiais de construção"),
    (r"COMERCIO VAREJISTA.*(FERRAGENS|MATERIAL DE CONSTRUCAO)", 22, "revende ferragens ou materiais de construção"),
    (r"CONSTRUCAO DE EDIFICIOS", 22, "executa construção de edifícios"),
    (r"OBRAS? DE ", 17, "executa obras"),
    (r"(MAQUINAS?|EQUIPAMENTOS?)", 17, "atua com máquinas ou equipamentos"),
    (r"(MANUTENCAO|REPARACAO).*(INDUSTR|MAQUIN|EQUIP)", 17, "realiza manutenção industrial"),
    (r"FABRICACAO", 8, "atividade de fabricação"),
)

NEGATIVE_RULES = (
    (r"(HOLDING|PARTICIPACOES SOCIETARIAS)", 45, "atividade predominantemente societária"),
    (r"(CONTABIL|JURIDIC|CONSULTORIA EM GESTAO)", 40, "serviço administrativo ou profissional"),
    (r"(RESTAURANTE|ALIMENTACAO|PADARIA|LANCHONETE)", 45, "atividade de alimentação"),
    (r"(ENSINO|ESCOLA|EDUCACAO)", 40, "atividade de educação"),
    (r"(MEDIC|ODONTO|HOSPITAL|SAUDE)", 40, "atividade de saúde"),
    (r"(ASSOCIACOES?|ORGANIZACOES ASSOCIATIVAS)", 45, "atividade associativa"),
    (r"(IMOBILIARIAS?|ALUGUEL DE IMOVEIS)", 35, "atividade imobiliária"),
    (r"TRANSPORTE RODOVIARIO DE CARGA", 25, "transportadora sem sinal direto de transformação ou obra"),
)


def normalize_text(value: str | None) -> str:
    text = unicodedata.normalize("NFD", value or "")
    return re.sub(r"[^A-Z0-9]+", " ", "".join(ch for ch in text if not unicodedata.combining(ch)).upper()).strip()


def cnae_class(cnae: str) -> str:
    return re.sub(r"\D", "", cnae or "")[:5]


def assess_cnae(cnae: str, description: str | None, customer_count: int, total_customers: int,
                top_customer_count: int, minimum_customers: int = 3) -> CnaeAssessment:
    code = re.sub(r"\D", "", cnae or "")
    text = normalize_text(description)
    share = customer_count / max(1, total_customers)
    frequency_score = min(40, 10 + round(30 * customer_count / max(1, top_customer_count)))
    score = frequency_score
    reasons = [f"observado em {customer_count} cliente(s) da carteira ({share:.2%})"]

    division = code[:2]
    if division in DIVISION_SCORES:
        points, reason = DIVISION_SCORES[division]
        score += points
        reasons.append(reason)

    for pattern, points, reason in POSITIVE_RULES:
        if re.search(pattern, text):
            score += points
            reasons.append(reason)

    negative_points = 0
    for pattern, points, reason in NEGATIVE_RULES:
        if re.search(pattern, text):
            negative_points = max(negative_points, points)
            reasons.append(reason)
    score -= negative_points
    score = max(0, min(100, score))

    if customer_count < minimum_customers:
        status = "pending"
        reasons.append(f"amostra inferior a {minimum_customers} clientes; requer revisão")
    elif score >= 60:
        status = "approved"
    elif score <= 25 or negative_points >= 40:
        status = "rejected"
    else:
        status = "pending"
        reasons.append("aderência comercial inconclusiva; requer revisão")

    return CnaeAssessment(code, description or "", customer_count, share, score, status, tuple(dict.fromkeys(reasons)))


def related_cnaes(seed_cnae: str, descriptions: dict[str, str]) -> list[tuple[str, str, str, float]]:
    """Retorna o CNAE exato e subclasses da mesma classe de cinco dígitos."""
    seed = re.sub(r"\D", "", seed_cnae or "")
    family = cnae_class(seed)
    matches = [(seed, descriptions.get(seed, ""), "exact", 1.0)]
    if len(family) != 5:
        return matches
    for candidate, description in descriptions.items():
        code = re.sub(r"\D", "", candidate or "")
        if code != seed and cnae_class(code) == family:
            matches.append((code, description, "same_class", 0.82))
    return matches
