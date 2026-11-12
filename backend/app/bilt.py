"""Bilt credit card CSV.
Purchases are POSITIVE here (the opposite of Chase), so amounts are flipped.
There is no category column. "Name on Card" is ignored: we never store the cardholder's name.
"Raw Merchant Name" is the bank's unformatted name; it is used to match history when present.
"""

import csv
import re

from .statements import Row, clean, merchant_key, parse_amount, parse_date, records, require_columns

PAYMENT = re.compile(r"\bPAYMENT\b", re.IGNORECASE)


def matches(header: list[str]) -> bool:
    return header[:2] == ["Transaction Date", "Posted Date"]


def parse(preamble: str, reader: csv.DictReader, first_line_no: int) -> tuple[str | None, list[Row]]:
    require_columns(reader, ["Transaction Date", "Description", "Amount"])
    last4 = None
    rows = []
    for line_no, rec in records(reader, first_line_no):
        amount = -parse_amount(rec["Amount"], line_no, required=True)
        merchant = clean(rec["Description"])
        raw_name = clean(rec.get("Raw Merchant Name"))
        digits = re.sub(r"\D", "", (rec.get("Card Last 4") or "").split(".")[0])
        last4 = last4 or (digits[-4:] if len(digits) >= 4 else None)
        rows.append(
            Row(
                date=parse_date(rec["Transaction Date"], "%Y-%m-%d", line_no),
                description_raw=rec["Description"],
                merchant=merchant,
                merchant_key=merchant_key(raw_name or merchant),
                amount=amount,
                bank_category=None,
                is_transfer=amount > 0 and bool(PAYMENT.search(merchant)),
            )
        )
    return last4, rows
