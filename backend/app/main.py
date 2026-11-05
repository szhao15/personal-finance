import datetime as dt
import hashlib

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import chase
from .db import get_session
from .models import Account, Category, Import, Rule, Transaction

MAX_UPLOAD_BYTES = 5 * 1024 * 1024

app = FastAPI(title="Personal Finance")


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    institution: str = "Chase"
    type: str = "credit_card"


class RuleIn(BaseModel):
    match_text: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=100)


def get_account(db: Session, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    return account


def get_or_create_category(db: Session, name: str) -> Category:
    category = db.scalar(select(Category).where(Category.name == name))
    if category is None:
        category = Category(name=name)
        db.add(category)
        db.flush()
    return category


def load_rules(db: Session) -> list[tuple[str, str]]:
    query = select(Rule.match_text, Category.name).join(Category).order_by(Rule.id)
    return [(text.upper(), name) for text, name in db.execute(query)]


def pick_category(rules: list[tuple[str, str]], row: chase.Row) -> str | None:
    """First matching rule wins; otherwise keep Chase's own category."""
    merchant = row.merchant.upper()
    return next((name for text, name in rules if text in merchant), row.chase_category)


def month_range(month: str) -> tuple[dt.date, dt.date]:
    try:
        start = dt.date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(400, "month must be YYYY-MM") from None
    end = dt.date(start.year + start.month // 12, start.month % 12 + 1, 1)
    return start, end


async def read_statement(file: UploadFile) -> tuple[str, str | None, list[chase.Row]]:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 5 MB")
    try:
        last4, rows = chase.parse(data.decode("utf-8-sig"))
    except UnicodeDecodeError:
        raise HTTPException(400, "File is not a UTF-8 text CSV") from None
    except chase.ParseError as e:
        raise HTTPException(400, str(e)) from None
    return hashlib.sha256(data).hexdigest(), last4, rows


def existing_keys(db: Session, account_id: int, rows: list[chase.Row]) -> set[str]:
    keys = [r.dedup_key for r in rows]
    query = select(Transaction.dedup_key).where(
        Transaction.account_id == account_id, Transaction.dedup_key.in_(keys)
    )
    return set(db.scalars(query))


@app.get("/accounts")
def list_accounts(db: Session = Depends(get_session)):
    accounts = db.scalars(select(Account).order_by(Account.name))
    return [{"id": a.id, "name": a.name, "institution": a.institution, "last4": a.last4} for a in accounts]


@app.post("/accounts", status_code=201)
def create_account(body: AccountIn, db: Session = Depends(get_session)):
    account = Account(**body.model_dump())
    db.add(account)
    db.commit()
    return {"id": account.id, "name": account.name, "institution": account.institution, "last4": None}


@app.post("/imports/preview")
async def preview_import(
    account_id: int = Form(), file: UploadFile = File(), db: Session = Depends(get_session)
):
    """Parse the file and show what would be imported. Nothing is saved."""
    get_account(db, account_id)
    sha, last4, rows = await read_statement(file)
    already = db.scalar(
        select(func.count()).where(Import.account_id == account_id, Import.file_sha256 == sha)
    )
    dupes = existing_keys(db, account_id, rows)
    rules = load_rules(db)
    return {
        "already_imported": already > 0,
        "last4": last4,
        "rows": [
            {
                "date": r.date.isoformat(),
                "merchant": r.merchant,
                "amount": str(r.amount),
                "category": pick_category(rules, r),
                "is_transfer": r.is_transfer,
                "duplicate": r.dedup_key in dupes,
            }
            for r in rows
        ],
    }


@app.post("/imports", status_code=201)
async def commit_import(
    account_id: int = Form(), file: UploadFile = File(), db: Session = Depends(get_session)
):
    """Re-parse the file and save only rows not already stored. The file itself is discarded."""
    account = get_account(db, account_id)
    sha, last4, rows = await read_statement(file)
    dupes = existing_keys(db, account_id, rows)
    new_rows = [r for r in rows if r.dedup_key not in dupes]
    if not new_rows:
        return {"import_id": None, "inserted": 0, "skipped": len(rows)}

    if last4 and not account.last4:
        account.last4 = last4
    imp = Import(account_id=account_id, filename=file.filename or "upload.csv", file_sha256=sha, row_count=0)
    db.add(imp)
    db.flush()

    rules = load_rules(db)
    category_ids: dict[str, int] = {}
    values = []
    for r in new_rows:
        name = pick_category(rules, r)
        if name and name not in category_ids:
            category_ids[name] = get_or_create_category(db, name).id
        values.append(
            {
                "account_id": account_id,
                "import_id": imp.id,
                "date": r.date,
                "description_raw": r.description_raw,
                "merchant": r.merchant,
                "amount": r.amount,
                "category_id": category_ids.get(name) if name else None,
                "is_transfer": r.is_transfer,
                "dedup_key": r.dedup_key,
            }
        )
    stmt = (
        insert(Transaction)
        .values(values)
        .on_conflict_do_nothing(index_elements=["account_id", "dedup_key"])
        .returning(Transaction.id)
    )
    imp.row_count = len(db.execute(stmt).all())
    db.commit()
    return {"import_id": imp.id, "inserted": imp.row_count, "skipped": len(rows) - imp.row_count}


@app.get("/imports")
def list_imports(db: Session = Depends(get_session)):
    query = select(Import, Account.name).join(Account).order_by(Import.imported_at.desc())
    return [
        {
            "id": imp.id,
            "account": account,
            "filename": imp.filename,
            "row_count": imp.row_count,
            "imported_at": imp.imported_at.isoformat(),
        }
        for imp, account in db.execute(query)
    ]


@app.delete("/imports/{import_id}")
def undo_import(import_id: int, db: Session = Depends(get_session)):
    imp = db.get(Import, import_id)
    if imp is None:
        raise HTTPException(404, "Import not found")
    db.delete(imp)  # the database cascades the delete to this import's transactions
    db.commit()
    return {"ok": True}


@app.get("/transactions")
def list_transactions(month: str, db: Session = Depends(get_session)):
    start, end = month_range(month)
    query = (
        select(Transaction, Category.name, Account.name)
        .join(Account)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.date >= start, Transaction.date < end)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    return [
        {
            "id": t.id,
            "date": t.date.isoformat(),
            "merchant": t.merchant,
            "amount": str(t.amount),
            "category": category,
            "is_transfer": t.is_transfer,
            "account": account,
        }
        for t, category, account in db.execute(query)
    ]


@app.get("/summary")
def spending_summary(month: str, db: Session = Depends(get_session)):
    """Spending per category for the month. Transfers are excluded; refunds reduce spending."""
    start, end = month_range(month)
    name = func.coalesce(Category.name, "Uncategorized")
    total = -func.sum(Transaction.amount)
    query = (
        select(name, total)
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.date >= start, Transaction.date < end, Transaction.is_transfer.is_(False))
        .group_by(name)
        .order_by(total.desc())
    )
    return [{"category": category, "total": str(amount)} for category, amount in db.execute(query)]


@app.get("/rules")
def list_rules(db: Session = Depends(get_session)):
    query = select(Rule.id, Rule.match_text, Category.name).join(Category).order_by(Rule.id)
    return [{"id": i, "match_text": text, "category": name} for i, text, name in db.execute(query)]


@app.post("/rules", status_code=201)
def create_rule(body: RuleIn, db: Session = Depends(get_session)):
    """Save a rule and apply it to matching transactions already stored."""
    category = get_or_create_category(db, body.category.strip())
    rule = Rule(match_text=body.match_text.strip(), category_id=category.id)
    db.add(rule)
    db.execute(
        update(Transaction)
        .where(func.strpos(func.upper(Transaction.merchant), rule.match_text.upper()) > 0)
        .values(category_id=category.id)
    )
    db.commit()
    return {"id": rule.id, "match_text": rule.match_text, "category": category.name}
