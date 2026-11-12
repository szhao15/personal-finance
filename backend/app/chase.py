"""Chase credit card CSV.
Amounts are already negative for purchases. Chase's own category is specific, so it is used as is.
"""

import csv
import re

from .statements import Row, clean, merchant_key, parse_amount, parse_date, records, require_columns


def matches(header: list[str]) -> bool:
    return header[:2] == ["Transaction Date", "Post Date"]


def parse(preamble: str, reader: csv.DictReader, first_line_no: int) -> tuple[str | None, list[Row]]:
    require_columns(reader, ["Transaction Date", "Description", "Category", "Type", "Amount"])
    match = re.search(r"Chase(\d{4})_", preamble)
    rows = []
    for line_no, rec in records(reader, first_line_no):
        amount = parse_amount(rec["Amount"], line_no, required=True)
        merchant = clean(rec["Description"])
        rows.append(
            Row(
                date=parse_date(rec["Transaction Date"], "%m/%d/%Y", line_no),
                description_raw=rec["Description"],
                merchant=merchant,
                merchant_key=merchant_key(merchant),
                amount=amount,
                bank_category=clean(rec["Category"]) or None,
                is_transfer=clean(rec["Type"]) == "Payment",
            )
        )
    return (match.group(1) if match else None), rows
