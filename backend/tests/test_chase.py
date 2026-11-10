from decimal import Decimal
from pathlib import Path

import pytest

from app import chase

FIXTURE = (Path(__file__).parent / "fixtures" / "chase_card.csv").read_text()


def test_parses_rows_and_last4():
    last4, rows = chase.parse(FIXTURE)
    assert last4 == "1234"
    assert len(rows) == 6
    first = rows[0]
    assert first.date.isoformat() == "2026-10-28"
    assert first.amount == Decimal("-84.17")
    assert first.merchant == "FAKE GROCER #101"
    assert first.description_raw == "FAKE GROCER   #101"
    assert first.chase_category == "Groceries"


def test_payment_is_transfer_and_has_no_category():
    _, rows = chase.parse(FIXTURE)
    payment = rows[-1]
    assert payment.is_transfer
    assert payment.chase_category is None
    assert not any(r.is_transfer for r in rows[:-1])


def test_identical_rows_get_distinct_keys_and_reimport_gives_same_keys():
    _, rows = chase.parse(FIXTURE)
    assert rows[1].dedup_key != rows[2].dedup_key
    _, again = chase.parse(FIXTURE)
    assert [r.dedup_key for r in rows] == [r.dedup_key for r in again]


def test_header_without_title_line():
    last4, rows = chase.parse(FIXTURE.split("\n", 1)[1])
    assert last4 is None
    assert len(rows) == 6


def test_dev_data_parses():
    dev_file = Path(__file__).parents[2] / "dev-data" / "fake_chase_card.csv"
    if not dev_file.exists():
        pytest.skip("dev-data is not mounted (e.g. inside the backend container)")
    last4, rows = chase.parse(dev_file.read_text())
    assert last4 == "0000"
    assert len(rows) > 100
    assert len({r.dedup_key for r in rows}) == len(rows)


def test_rejects_non_chase_file():
    with pytest.raises(chase.ParseError, match="header row not found"):
        chase.parse("Date,Amount\n10/01/2026,5.00\n")


def test_rejects_bad_amount():
    bad = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n10/01/2026,10/01/2026,X,,Sale,abc,\n"
    with pytest.raises(chase.ParseError, match="Line 2"):
        chase.parse(bad)
