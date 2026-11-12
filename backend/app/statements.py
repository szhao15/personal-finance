"""Shared statement parsing: detects the bank from the header row and returns standard rows.

Every parser returns amounts with one convention: negative = money out, positive = money in.
"""

import csv
import datetime as dt
import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

CENT = Decimal("0.01")


class ParseError(ValueError):
    pass


@dataclass
class Row:
    date: dt.date
    description_raw: str
    merchant: str  # display name
    merchant_key: str  # cleaned name used to learn categories from history
    amount: Decimal
    bank_category: str | None  # the bank's own category, only when it is specific enough to use
    is_transfer: bool
    dedup_key: str = ""


def clean(text: str | None) -> str:
    """Collapse runs of whitespace: "LYFT   *RIDE" -> "LYFT *RIDE"."""
    return " ".join((text or "").split())


def parse_amount(text: str | None, line_no: int, required: bool = False) -> Decimal | None:
    """"$1,234.50" -> Decimal("1234.50"); blank -> None (or an error when required)."""
    text = (text or "").strip().replace("$", "").replace(",", "")
    if not text:
        if required:
            raise ParseError(f"Line {line_no}: missing amount")
        return None
    try:
        amount = Decimal(text).quantize(CENT)
    except InvalidOperation:
        raise ParseError(f"Line {line_no}: invalid amount {text!r}") from None
    if not amount.is_finite():
        raise ParseError(f"Line {line_no}: invalid amount {text!r}")
    return amount


def parse_date(text: str | None, fmt: str, line_no: int) -> dt.date:
    try:
        return dt.datetime.strptime((text or "").strip(), fmt).date()
    except ValueError:
        raise ParseError(f"Line {line_no}: invalid date {text!r}") from None


# Card processors put their own prefix before the merchant: "SQ *BLUE DOOR", "TST* PIZZA", "DD *DOORDASH ..."
PROCESSOR_PREFIX = re.compile(r"^(SQ|TST|DD|SP|PY|PP|PAYPAL|IN)\s*\*\s*")


def merchant_key(name: str) -> str:
    """Reduce a description to a stable merchant name, so the same store matches across
    banks and branches: "TRADER JOE S #725" -> "TRADER JOE S", "LYFT *RIDE 10-31" -> "LYFT"."""
    key = PROCESSOR_PREFIX.sub("", name.upper())
    key = re.split(r"[#*]", key)[0]  # store numbers and processor suffixes come after # or *
    key = re.sub(r"[^A-Z& ]+", " ", key)  # drop digits and punctuation
    return " ".join(key.split()) or name.upper().strip()


def assign_dedup_keys(rows: list[Row]) -> None:
    """Count identical rows so two real identical charges on one day both survive,
    while re-importing the same statement produces the same keys and is skipped."""
    seen: Counter[str] = Counter()
    for row in rows:
        base = f"{row.date.isoformat()}|{row.amount}|{row.merchant.upper()}"
        seen[base] += 1
        row.dedup_key = hashlib.sha256(f"{base}|{seen[base]}".encode()).hexdigest()


def require_columns(reader: csv.DictReader, columns: list[str]) -> None:
    missing = [c for c in columns if c not in (reader.fieldnames or [])]
    if missing:
        raise ParseError(f"Missing columns: {', '.join(missing)}")


def records(reader: csv.DictReader, first_line_no: int):
    """Yield (line number, record) for each non-blank row."""
    for line_no, rec in enumerate(reader, start=first_line_no):
        if any((v or "").strip() for v in rec.values() if isinstance(v, str)):
            yield line_no, rec


def parse(text: str) -> tuple[str, str | None, list[Row]]:
    """Return (bank name, card last 4 if the file names it, rows)."""
    from . import bilt, chase, citi  # imported here: the bank modules import helpers from this one

    banks = [("Chase", chase), ("Citi", citi), ("Bilt", bilt)]
    lines = text.splitlines()
    for i, line in enumerate(lines):
        delimiter = "\t" if "\t" in line and "," not in line else ","
        header = [h.strip() for h in next(csv.reader([line], delimiter=delimiter), [])]
        for name, module in banks:
            if module.matches(header):
                reader = csv.DictReader(lines[i:], delimiter=delimiter)
                reader.fieldnames = [h.strip() for h in reader.fieldnames or []]
                last4, rows = module.parse("\n".join(lines[:i]), reader, first_line_no=i + 2)
                assign_dedup_keys(rows)
                return name, last4, rows
    raise ParseError("Unrecognized statement: expected a Chase, Citi or Bilt credit card CSV export")
