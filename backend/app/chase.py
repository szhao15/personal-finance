"""Parser for Chase credit card CSV exports."""

import csv
import datetime as dt
import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

REQUIRED_COLUMNS = ["Transaction Date", "Description", "Category", "Type", "Amount"]
CENT = Decimal("0.01")


class ParseError(ValueError):
    pass


@dataclass
class Row:
    date: dt.date
    description_raw: str
    merchant: str
    amount: Decimal
    chase_category: str | None
    is_transfer: bool
    dedup_key: str


def parse(text: str) -> tuple[str | None, list[Row]]:
    """Return (card last 4 digits if the file names them, parsed rows)."""
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith("Transaction Date,")), None)
    if start is None:
        raise ParseError("Not a Chase credit card CSV: header row not found")

    # Some exports start with a title line like "Chase9602_Activity20241104_...".
    match = re.search(r"Chase(\d{4})_", "\n".join(lines[:start]))
    last4 = match.group(1) if match else None

    reader = csv.DictReader(lines[start:])
    missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise ParseError(f"Missing columns: {', '.join(missing)}")

    rows: list[Row] = []
    seen: Counter[str] = Counter()
    for line_no, rec in enumerate(reader, start=start + 2):
        try:
            date = dt.datetime.strptime(rec["Transaction Date"], "%m/%d/%Y").date()
            amount = Decimal(rec["Amount"]).quantize(CENT)
        except (ValueError, TypeError, InvalidOperation):
            raise ParseError(f"Line {line_no}: invalid date or amount") from None
        if not amount.is_finite():
            raise ParseError(f"Line {line_no}: invalid amount")

        merchant = " ".join(rec["Description"].split())
        # Count identical rows so two real identical charges on one day both survive,
        # while re-importing the same statement produces the same keys and is skipped.
        base = f"{date.isoformat()}|{amount}|{merchant.upper()}"
        seen[base] += 1
        rows.append(
            Row(
                date=date,
                description_raw=rec["Description"],
                merchant=merchant,
                amount=amount,
                chase_category=rec["Category"] or None,
                is_transfer=rec["Type"] == "Payment",
                dedup_key=hashlib.sha256(f"{base}|{seen[base]}".encode()).hexdigest(),
            )
        )
    return last4, rows
