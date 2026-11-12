from decimal import Decimal

import pytest

from app import statements
from app.categorize import built_in_category, categorize_rows, pick_category
from app.statements import merchant_key

# Made-up sample exports, in each bank's layout. "CARDHOLDER" stands in for the name field.
CITI_CSV = """\
Name:,CARDHOLDER,,,
Card:,Card-4321,,,
,,,,
Time period of report:,"Jan. 01, 2025 (09:00 AM) to Dec. 31, 2025 (09:00 AM)",,,
,,,,
Date,Description,Debit,Credit,Category
"Dec 15, 2025",TRADER JOE S #725  MN,75.77,,Merchandise
"Dec 12, 2025",DEMO TRATTORIA,"$1,042.10",,Restaurants
"Dec 10, 2025",EXAMPLE OUTFITTERS,,25.00,Merchandise
"Dec 02, 2025","ONLINE PAYMENT, THANK YOU",,500.00,
,,,,
"""

BILT_CSV = """\
Transaction Date,Posted Date,Description,Amount,Card Last 4,Name on Card,Raw Merchant Name
2026-11-09,2026-11-09,Autopay Payment,-920.17,,,
2026-11-08,2026-11-08,LA Fitness,37.92,9876,CARDHOLDER,LA FITNESS
2026-11-02,2026-11-05,Film Society of Minneapolis St Paul,13.00,9876,CARDHOLDER,THE FILM SOCIETY OF MI
2026-11-01,2026-11-03,Example Outfitters,-20.00,9876,CARDHOLDER,EXAMPLE OUTFITTERS
"""


def test_citi():
    bank, last4, rows = statements.parse(CITI_CSV)
    assert (bank, last4, len(rows)) == ("Citi", "4321", 4)
    groceries, dinner, refund, payment = rows
    assert groceries.date.isoformat() == "2025-12-15"
    assert groceries.amount == Decimal("-75.77")  # debit -> money out
    assert groceries.merchant_key == "TRADER JOE S"  # matches Chase's "TRADER JOE S #552" too
    assert groceries.bank_category is None  # "Merchandise" is too broad to use
    assert dinner.amount == Decimal("-1042.10")  # "$1,042.10"
    assert dinner.bank_category == "Food & Drink"  # "Restaurants" translated
    assert refund.amount == Decimal("25.00") and not refund.is_transfer
    assert payment.amount == Decimal("500.00") and payment.is_transfer


def test_cardholder_name_is_never_kept():
    for text in (CITI_CSV, BILT_CSV):
        _, _, rows = statements.parse(text)
        assert not any("CARDHOLDER" in f"{r.description_raw}{r.merchant}{r.merchant_key}".upper() for r in rows)


def test_citi_rejects_row_with_both_debit_and_credit():
    text = "Date,Description,Debit,Credit,Category\n\"Dec 01, 2025\",X,1.00,2.00,\n"
    with pytest.raises(statements.ParseError, match="exactly one"):
        statements.parse(text)


def test_bilt():
    bank, last4, rows = statements.parse(BILT_CSV)
    assert (bank, last4, len(rows)) == ("Bilt", "9876", 4)
    payment, gym, film, refund = rows
    assert payment.amount == Decimal("920.17") and payment.is_transfer  # flipped: negative in the file
    assert gym.amount == Decimal("-37.92") and not gym.is_transfer  # purchases are positive in the file
    assert gym.merchant == "LA Fitness"
    assert film.merchant_key == "THE FILM SOCIETY OF MI"  # from Raw Merchant Name
    assert refund.amount == Decimal("20.00") and not refund.is_transfer
    assert all(r.bank_category is None for r in rows)


def test_tab_separated_file():
    text = "Date\tDescription\tDebit\tCredit\tCategory\nDec 05, 2025\tLUNDS&BYERLYS NE\t4.89\t\tMerchandise\n"
    bank, _, rows = statements.parse(text)
    assert bank == "Citi" and rows[0].amount == Decimal("-4.89")


@pytest.mark.parametrize(
    "raw, key",
    [
        ("TRADER JOE S #725", "TRADER JOE S"),
        ("LYFT   *RIDE 10-31", "LYFT"),
        ("SQ *BLUE DOOR PUB", "BLUE DOOR PUB"),
        ("DD *DOORDASH SURDYKSLI", "DOORDASH SURDYKSLI"),
        ("AMZN Mktp US*FAKE123", "AMZN MKTP US"),
        ("UNITED NOODLES, INC", "UNITED NOODLES INC"),
        ("LUNDS&BYERLYS NE", "LUNDS&BYERLYS NE"),
        ("123456", "123456"),  # nothing left after cleanup: keep the original
    ],
)
def test_merchant_key(raw, key):
    assert merchant_key(raw) == key


def test_built_in_list_matches_whole_words():
    assert built_in_category("LA FITNESS") == "Health & Wellness"
    assert built_in_category("SHELL OIL") == "Gas"
    assert built_in_category("SHELLFISH SHACK") is None
    assert built_in_category("DELTA DENTAL") == "Health & Wellness"
    assert built_in_category("LUNDS&BYERLYS NE") == "Groceries"


def test_category_order():
    row = statements.Row(
        date=None, description_raw="", merchant="TRADER JOE S #725", merchant_key="TRADER JOE S",
        amount=Decimal("-1"), bank_category="Shopping", is_transfer=False,
    )
    rules = [("TRADER JOE", "My Groceries")]
    history = {"TRADER JOE S": "Food"}
    assert pick_category(rules, history, row) == "My Groceries"  # 1. rules
    assert pick_category([], history, row) == "Food"  # 2. history
    assert pick_category([], {}, row) == "Shopping"  # 3. bank category
    row.bank_category = None
    assert pick_category([], {}, row) == "Groceries"  # 4. built-in list
    row.merchant_key = "UNKNOWN PLACE"
    assert pick_category([], {}, row) is None  # Uncategorized


def make_row(merchant_key, amount, is_transfer=False, bank_category=None):
    return statements.Row(
        date=None, description_raw=merchant_key, merchant=merchant_key, merchant_key=merchant_key,
        amount=Decimal(amount), bank_category=bank_category, is_transfer=is_transfer,
    )


def test_refund_takes_category_of_purchase_in_same_file():
    rows = [
        make_row("CORNER CURIOS", "-40.00"),  # new merchant, no category source
        make_row("EXAMPLE OUTFITTERS", "-60.00", bank_category="Shopping"),
        make_row("EXAMPLE OUTFITTERS", "25.00"),  # refund: no category of its own
        make_row("PAYMENT THANK YOU", "500.00", is_transfer=True),
    ]
    assert categorize_rows([], {}, rows) == [None, "Shopping", "Shopping", None]


def test_refund_prefers_earlier_history_over_this_file():
    rows = [make_row("EXAMPLE OUTFITTERS", "-60.00", bank_category="Shopping"), make_row("EXAMPLE OUTFITTERS", "25.00")]
    assert categorize_rows([], {"EXAMPLE OUTFITTERS": "Clothing"}, rows) == ["Clothing", "Clothing"]
