import datetime as dt
import hashlib

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import statements
from .categorize import categorize_rows
from .db import get_session
from .models import Account, Category, Import, Rule, Transaction

MAX_UPLOAD_BYTES = 5 * 1024 * 1024

app = FastAPI(title="Personal Finance")


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    institution: str = "Unknown"  # set from the first imported statement
    type: str = "credit_card"


class RuleIn(BaseModel):
    match_text: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=100)


class CategoryIn(BaseModel):
    category: str | None = Field(default=None, max_length=100)  # None = Uncategorized


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


def load_history(db: Session, rows: list[statements.Row]) -> dict[str, str]:
    """merchant_key -> category of that merchant's most recent categorized transaction."""
    keys = {r.merchant_key for r in rows}
    query = (
        select(Transaction.merchant_key, Category.name)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.merchant_key.in_(keys), Transaction.is_transfer.is_(False))
        .order_by(Transaction.merchant_key, Transaction.date.desc(), Transaction.id.desc())
        .distinct(Transaction.merchant_key)  # Postgres DISTINCT ON: first row per merchant
    )
    return dict(db.execute(query).tuples().all())


async def read_statement(file: UploadFile) -> tuple[str, str, str | None, list[statements.Row]]:
    """Returns (file sha256, bank, card last 4, rows)."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 5 MB")
    try:
        bank, last4, rows = statements.parse(data.decode("utf-8-sig"))
    except UnicodeDecodeError:
        raise HTTPException(400, "File is not a UTF-8 text CSV. Export a CSV from your bank (not a Numbers or Excel file).") from None
    except statements.ParseError as e:
        raise HTTPException(400, str(e)) from None
    return hashlib.sha256(data).hexdigest(), bank, last4, rows


def has_imports(db: Session, account_id: int) -> bool:
    return db.scalar(select(Import.id).where(Import.account_id == account_id).limit(1)) is not None


def existing_keys(db: Session, account_id: int, rows: list[statements.Row]) -> set[str]:
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
    account = get_account(db, account_id)
    sha, bank, last4, rows = await read_statement(file)
    already = db.scalar(
        select(func.count()).where(Import.account_id == account_id, Import.file_sha256 == sha)
    )
    dupes = existing_keys(db, account_id, rows)
    rules = load_rules(db)
    categories = categorize_rows(rules, load_history(db, rows), rows)
    warning = None
    if has_imports(db, account_id) and account.institution != bank:
        warning = f"This looks like a {bank} statement, but {account.name} holds {account.institution} transactions."
    return {
        "bank": bank,
        "warning": warning,
        "already_imported": already > 0,
        "last4": last4,
        "rows": [
            {
                "date": r.date.isoformat(),
                "merchant": r.merchant,
                "amount": str(r.amount),
                "category": category,
                "is_transfer": r.is_transfer,
                "duplicate": r.dedup_key in dupes,
            }
            for r, category in zip(rows, categories)
        ],
    }


@app.post("/imports", status_code=201)
async def commit_import(
    account_id: int = Form(), file: UploadFile = File(), db: Session = Depends(get_session)
):
    """Re-parse the file and save only rows not already stored. The file itself is discarded."""
    account = get_account(db, account_id)
    sha, bank, last4, rows = await read_statement(file)
    dupes = existing_keys(db, account_id, rows)
    new_rows = [r for r in rows if r.dedup_key not in dupes]
    if not new_rows:
        return {"import_id": None, "inserted": 0, "skipped": len(rows)}

    if not has_imports(db, account_id):
        account.institution = bank
    if last4 and not account.last4:
        account.last4 = last4
    imp = Import(account_id=account_id, filename=file.filename or "upload.csv", file_sha256=sha, row_count=0)
    db.add(imp)
    db.flush()

    rules = load_rules(db)
    names = categorize_rows(rules, load_history(db, new_rows), new_rows)
    category_ids: dict[str, int] = {}
    values = []
    for r, name in zip(new_rows, names):
        if name and name not in category_ids:
            category_ids[name] = get_or_create_category(db, name).id
        values.append(
            {
                "account_id": account_id,
                "import_id": imp.id,
                "date": r.date,
                "description_raw": r.description_raw,
                "merchant": r.merchant,
                "merchant_key": r.merchant_key,
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
def list_transactions(
    start: dt.date | None = None,
    end: dt.date | None = None,
    account_id: list[int] = Query(default=[]),
    db: Session = Depends(get_session),
):
    """Transactions between start and end (both inclusive, both optional).
    No account_id means all accounts; repeat it to pick several."""
    if start and end and start > end:
        raise HTTPException(400, "start must be on or before end")
    query = (
        select(Transaction, Category.name, Account.name)
        .join(Account)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    if start:
        query = query.where(Transaction.date >= start)
    if end:
        query = query.where(Transaction.date <= end)
    if account_id:
        query = query.where(Transaction.account_id.in_(account_id))
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


@app.patch("/transactions/{transaction_id}")
def set_transaction_category(transaction_id: int, body: CategoryIn, db: Session = Depends(get_session)):
    """Change one transaction's category. Future imports of the same merchant learn from it (history)."""
    t = db.get(Transaction, transaction_id)
    if t is None:
        raise HTTPException(404, "Transaction not found")
    name = (body.category or "").strip()
    t.category_id = get_or_create_category(db, name).id if name else None
    db.commit()
    return {"id": t.id, "category": name or None}


@app.get("/categories")
def list_categories(db: Session = Depends(get_session)):
    return list(db.scalars(select(Category.name).order_by(Category.name)))


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
