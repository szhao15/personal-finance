"""Citi credit card CSV.

Debit and Credit are separate positive columns: a debit becomes negative, a credit positive.
Citi's categories are broad payment-network groups ("Merchandise" covers groceries and stores alike),
so only the specific ones are translated; the rest are left for history and the built-in list.
"""

import csv
import re

from .statements import ParseError, Row, clean, merchant_key, parse_amount, parse_date, records, require_columns

# Lower-case words in Citi's category -> our category. "Merchandise" and "Services" are too broad to use.
CATEGORY_WORDS = [
    ("restaurant", "Food & Drink"),
    ("dining", "Food & Drink"),
    ("supermarket", "Groceries"),
    ("grocer", "Groceries"),
    ("gas", "Gas"),
    ("airline", "Travel"),
    ("hotel", "Travel"),
    ("lodging", "Travel"),
    ("travel", "Travel"),
    ("transportation", "Travel"),
    ("entertainment", "Entertainment"),
    ("medical", "Health & Wellness"),
    ("pharmac", "Health & Wellness"),
    ("utilit", "Bills & Utilities"),
]
PAYMENT = re.compile(r"\bPAYMENT\b|\bAUTOPAY\b|AUTO-PMT", re.IGNORECASE)


def matches(header: list[str]) -> bool:
    return header[:4] == ["Date", "Description", "Debit", "Credit"]


def translate_category(citi_category: str | None) -> str | None:
    text = (citi_category or "").lower()
    return next((ours for word, ours in CATEGORY_WORDS if word in text), None)


def parse(preamble: str, reader: csv.DictReader, first_line_no: int) -> tuple[str | None, list[Row]]:
    require_columns(reader, ["Date", "Description", "Debit", "Credit"])
    match = re.search(r"Card-\D*(\d{4})\b", preamble)
    rows = []
    for line_no, rec in records(reader, first_line_no):
        debit = parse_amount(rec["Debit"], line_no)
        credit = parse_amount(rec["Credit"], line_no)
        if (debit is None) == (credit is None):
            raise ParseError(f"Line {line_no}: expected an amount in exactly one of Debit or Credit")
        amount = -abs(debit) if debit is not None else abs(credit)
        merchant = clean(rec["Description"])
        is_payment = credit is not None and bool(PAYMENT.search(merchant))
        rows.append(
            Row(
                date=parse_date(rec["Date"], "%b %d, %Y", line_no),
                description_raw=rec["Description"],
                merchant=merchant,
                merchant_key=merchant_key(merchant),
                amount=amount,
                bank_category=None if is_payment else translate_category(rec.get("Category")),
                is_transfer=is_payment,
            )
        )
    return (match.group(1) if match else None), rows
