"""Generate a fake Chase credit card CSV for development.

Every merchant and amount is made up. Output is deterministic (fixed random seed),
so regenerating produces the same file.

    python backend/scripts/make_fake_data.py
"""

import datetime as dt
import random
from decimal import Decimal
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "dev-data" / "fake_chase_card.csv"
START, END = dt.date(2026, 6, 1), dt.date(2026, 11, 8)

# (description, Chase category, min amount, max amount, average visits per month)
EVERYDAY = [
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
# (description, Chase category, amount, day of month)
MONTHLY = [
    ("STREAMFLIX.COM", "Entertainment", Decimal("15.49"), 3),
    ("SOUNDWAVE MUSIC", "Entertainment", Decimal("10.99"), 12),
    ("SAMPLE GYM CLUB", "Health & Wellness", Decimal("45.00"), 1),
    ("DEMO ELECTRIC CO", "Bills & Utilities", None, 18),
    ("FAKE WIRELESS", "Bills & Utilities", Decimal("65.00"), 22),
]


def months():
    d = START.replace(day=1)
    while d <= END:
        yield d
        d = dt.date(d.year + d.month // 12, d.month % 12 + 1, 1)


def money(low, high, rng):
    return Decimal(rng.uniform(low, high)).quantize(Decimal("0.01"))


def main():
    rng = random.Random(42)
    rows = []  # (date, description, category, type, amount)
    for month in months():
        days_in_month = (dt.date(month.year + month.month // 12, month.month % 12 + 1, 1) - month).days
        for desc, cat, low, high, visits in EVERYDAY:
            for _ in range(rng.randint(max(0, visits - 1), visits + 1)):
                rows.append((month.replace(day=rng.randint(1, days_in_month)), desc, cat, "Sale", -money(low, high, rng)))
        for desc, cat, amount, day in MONTHLY:
            rows.append((month.replace(day=day), desc, cat, "Sale", -(amount or money(60, 130, rng))))
        # One refund a month, and a payment covering last month's spending.
        rows.append((month.replace(day=rng.randint(5, 25)), "EXAMPLE OUTFITTERS", "Shopping", "Return", money(15, 40, rng)))
        rows.append((month.replace(day=2), "Payment Thank You-Mobile", "", "Payment", Decimal("1450.00")))

    rows = sorted((r for r in rows if START <= r[0] <= END), key=lambda r: r[0], reverse=True)
    lines = [
        f"Chase0000_Activity{START:%Y%m%d}_{END:%Y%m%d}_{END:%Y%m%d}",
        "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
    ]
    for date, desc, cat, kind, amount in rows:
        posted = min(date + dt.timedelta(days=rng.randint(0, 2)), END)
        lines.append(f"{date:%m/%d/%Y},{posted:%m/%d/%Y},{desc},{cat},{kind},{amount},")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {len(rows)} fake transactions to {OUT}")


if __name__ == "__main__":
    main()
