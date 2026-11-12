"""Generate fake Chase, Citi and Bilt credit card CSVs for development.

Every merchant, name and amount is made up. Output is deterministic (fixed random seeds),
so regenerating produces the same files.

    python backend/scripts/make_fake_data.py

The Citi and Bilt files reuse some Chase merchants (categorized by history), some well-known
names (built-in list) and a few unknown ones (left Uncategorized for review).
"""

import csv
import datetime as dt
import random
from decimal import Decimal
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[2] / "dev-data"
START, END = dt.date(2026, 6, 1), dt.date(2026, 11, 8)

# Everyday: (description, bank category, min amount, max amount, average visits per month)
# Monthly:  (description, bank category, amount or None for random, day of month)
CHASE_EVERYDAY = [
    ("FAKE GROCER #101", "Groceries", 40, 140, 4),
    ("SAMPLE MARKET", "Groceries", 15, 60, 3),
    ("SAMPLE COFFEE CO", "Food & Drink", 4, 9, 8),
    ("DEMO BURRITO BAR", "Food & Drink", 11, 18, 3),
    ("DD *DOORDASH FAKEDINER", "Food & Drink", 18, 45, 2),
    ("LYFT   *RIDE FAKE", "Travel", 9, 32, 3),
    ("FAKEFUEL #12", "Gas", 30, 60, 3),
    ("EXAMPLE OUTFITTERS", "Shopping", 25, 120, 1),
    ("AMZN Mktp US*FAKE123", "Shopping", 10, 80, 3),
    ("DEMO PHARMACY", "Health & Wellness", 8, 40, 1),
    ("PLACEHOLDER CINEMAS", "Entertainment", 14, 40, 1),
]
CHASE_MONTHLY = [
    ("STREAMFLIX.COM", "Entertainment", Decimal("15.49"), 3),
    ("SOUNDWAVE MUSIC", "Entertainment", Decimal("10.99"), 12),
    ("SAMPLE GYM CLUB", "Health & Wellness", Decimal("45.00"), 1),
    ("DEMO ELECTRIC CO", "Bills & Utilities", None, 18),
    ("FAKE WIRELESS", "Bills & Utilities", Decimal("65.00"), 22),
]

CITI_EVERYDAY = [
    ("FAKE GROCER #205", "Merchandise", 30, 110, 2),  # history (Chase) -> Groceries
    ("SAMPLE COFFEE CO", "Merchandise", 4, 9, 4),  # history (Chase) -> Food & Drink
    ("DEMO TRATTORIA", "Restaurants", 35, 90, 2),  # Citi category translated -> Food & Drink
    ("TRADER JOE S #725  MN", "Merchandise", 25, 90, 2),  # built-in list -> Groceries
    ("SHELL OIL 57444", "Merchandise", 30, 55, 2),  # built-in list -> Gas
    ("CORNER CURIOS", "Merchandise", 10, 60, 1),  # unknown -> Uncategorized
]
CITI_MONTHLY = [("FAKE STREAMING PLUS", "Merchandise", Decimal("7.99"), 9)]  # unknown -> Uncategorized

BILT_EVERYDAY = [
    ("Placeholder Cinemas", None, 14, 40, 1),  # history (Chase) -> Entertainment
    ("Demo Burrito Bar", None, 11, 18, 2),  # history (Chase) -> Food & Drink
    ("Lakeside Bookshop", None, 12, 45, 1),  # unknown -> Uncategorized
]
BILT_MONTHLY = [
    ("LA Fitness", None, Decimal("37.92"), 8),  # built-in list -> Health & Wellness
    ("Bilt Rent Placeholder Apts", None, Decimal("1650.00"), 1),  # unknown -> Uncategorized
]


def months():
    d = START.replace(day=1)
    while d <= END:
        yield d
        d = dt.date(d.year + d.month // 12, d.month % 12 + 1, 1)


def money(low, high, rng):
    return Decimal(rng.uniform(low, high)).quantize(Decimal("0.01"))


def make_rows(rng, everyday, monthly, refund, payment):
    """Rows of (date, description, bank category, type, amount); amount negative = money out."""
    rows = []
    for month in months():
        days_in_month = (dt.date(month.year + month.month // 12, month.month % 12 + 1, 1) - month).days
        for desc, cat, low, high, visits in everyday:
            for _ in range(rng.randint(max(0, visits - 1), visits + 1)):
                rows.append((month.replace(day=rng.randint(1, days_in_month)), desc, cat, "Sale", -money(low, high, rng)))
        for desc, cat, amount, day in monthly:
            rows.append((month.replace(day=day), desc, cat, "Sale", -(amount or money(60, 130, rng))))
        if refund:
            rows.append((month.replace(day=rng.randint(5, 25)), refund[0], refund[1], "Return", money(15, 40, rng)))
        rows.append((month.replace(day=2), payment[0], "", "Payment", payment[1]))
    return sorted((r for r in rows if START <= r[0] <= END), key=lambda r: r[0], reverse=True)


def write_chase(path, rng):
    rows = make_rows(rng, CHASE_EVERYDAY, CHASE_MONTHLY, ("EXAMPLE OUTFITTERS", "Shopping"), ("Payment Thank You-Mobile", Decimal("1450.00")))
    lines = [
        f"Chase0000_Activity{START:%Y%m%d}_{END:%Y%m%d}_{END:%Y%m%d}",
        "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
    ]
    for date, desc, cat, kind, amount in rows:
        posted = min(date + dt.timedelta(days=rng.randint(0, 2)), END)
        lines.append(f"{date:%m/%d/%Y},{posted:%m/%d/%Y},{desc},{cat},{kind},{amount},")
    path.write_text("\n".join(lines) + "\n")
    return len(rows)


def write_citi(path, rng):
    rows = make_rows(rng, CITI_EVERYDAY, CITI_MONTHLY, None, ("ONLINE PAYMENT, THANK YOU", Decimal("300.00")))
    with path.open("w", newline="") as f:
        out = csv.writer(f, lineterminator="\n")
        out.writerows([["Name:", "DEV USER", "", "", ""], ["Card:", "Card-1111", "", "", ""], [""] * 5])
        out.writerow(["Time period of report:", f"{START:%b. %d, %Y} (09:00 AM) to {END:%b. %d, %Y} (09:00 AM)", "", "", ""])
        out.writerows([[""] * 5, ["Date", "Description", "Debit", "Credit", "Category"]])
        for date, desc, cat, _, amount in rows:
            debit, credit = (-amount, "") if amount < 0 else ("", amount)
            out.writerow([f"{date:%b %d, %Y}", desc, debit, credit, cat])
    return len(rows)


def write_bilt(path, rng):
    rows = make_rows(rng, BILT_EVERYDAY, BILT_MONTHLY, ("Example Outfitters", None), ("Autopay Payment", Decimal("2000.00")))
    with path.open("w", newline="") as f:
        out = csv.writer(f, lineterminator="\n")
        out.writerow(["Transaction Date", "Posted Date", "Description", "Amount", "Card Last 4", "Name on Card", "Raw Merchant Name"])
        for date, desc, _, kind, amount in rows:
            posted = min(date + dt.timedelta(days=rng.randint(0, 3)), END)
            card = ("", "", "") if kind == "Payment" else ("2222", "Dev User", desc.upper())
            out.writerow([f"{date:%Y-%m-%d}", f"{posted:%Y-%m-%d}", desc, -amount, *card])  # Bilt: purchases positive
    return len(rows)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for name, writer, seed in [
        ("fake_chase_card.csv", write_chase, 42),
        ("fake_citi_card.csv", write_citi, 7),
        ("fake_bilt_card.csv", write_bilt, 9),
    ]:
        count = writer(OUT_DIR / name, random.Random(seed))
        print(f"Wrote {count} fake transactions to {OUT_DIR / name}")


if __name__ == "__main__":
    main()
