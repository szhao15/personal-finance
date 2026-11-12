from decimal import Decimal
from pathlib import Path

import pytest

from app import statements

FIXTURE = (Path(__file__).parent / "fixtures" / "chase_card.csv").read_text()


def test_parses_rows_and_last4():
    bank, last4, rows = statements.parse(FIXTURE)
    assert bank == "Chase"
    assert last4 == "1234"
    assert len(rows) == 6
    first = rows[0]
    assert first.date.isoformat() == "2026-10-28"
    assert first.amount == Decimal("-84.17")
    assert first.merchant == "FAKE GROCER #101"
    assert first.merchant_key == "FAKE GROCER"
    assert first.description_raw == "FAKE GROCER   #101"
    assert first.bank_category == "Groceries"


def test_payment_is_transfer_and_has_no_category():
    _, _, rows = statements.parse(FIXTURE)
    payment = rows[-1]
    assert payment.is_transfer
    assert payment.bank_category is None
    assert not any(r.is_transfer for r in rows[:-1])


def test_identical_rows_get_distinct_keys_and_reimport_gives_same_keys():
    _, _, rows = statements.parse(FIXTURE)
    assert rows[1].dedup_key != rows[2].dedup_key
    _, _, again = statements.parse(FIXTURE)
    assert [r.dedup_key for r in rows] == [r.dedup_key for r in again]


def test_header_without_title_line():
    _, last4, rows = statements.parse(FIXTURE.split("\n", 1)[1])
    assert last4 is None
    assert len(rows) == 6


def test_dev_data_parses():
    dev_data = Path(__file__).parents[2] / "dev-data"
    if not dev_data.exists():
        pytest.skip("dev-data is not mounted (e.g. inside the backend container)")
    for name, bank, last4 in [("fake_chase_card.csv", "Chase", "0000"), ("fake_citi_card.csv", "Citi", "1111"), ("fake_bilt_card.csv", "Bilt", "2222")]:
        parsed_bank, parsed_last4, rows = statements.parse((dev_data / name).read_text())
        assert (parsed_bank, parsed_last4) == (bank, last4)
        assert len(rows) > 20
        assert len({r.dedup_key for r in rows}) == len(rows)


def test_rejects_unknown_file():
    with pytest.raises(statements.ParseError, match="Unrecognized statement"):
        statements.parse("Date,Amount\n10/01/2026,5.00\n")


def test_rejects_bad_amount():
    bad = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n10/01/2026,10/01/2026,X,,Sale,abc,\n"
    with pytest.raises(statements.ParseError, match="Line 2"):
        statements.parse(bad)
