import re
import unicodedata


def normalized(value: str | None) -> str:
    text = unicodedata.normalize("NFD", value or "")
    return re.sub(
        r"[^A-Z0-9]+",
        " ",
        "".join(ch for ch in text if not unicodedata.combining(ch)).upper(),
    ).strip()


def valid_cnae(value: str | None) -> str | None:
    code = re.sub(r"\D", "", value or "")
    return code if re.fullmatch(r"\d{7}", code) else None


def secondary_cnae_codes(value: str | None) -> set[str]:
    digits = re.sub(r"\D", "", value or "")
    return set(re.findall(r"\d{7}", digits))


def matches_reference(company_name: str | None, reference_name: str | None) -> bool:
    company = normalized(company_name)
    reference = normalized(reference_name)
    return bool(company and reference and (
        company == reference or company.startswith(f"{reference} ")
    ))
