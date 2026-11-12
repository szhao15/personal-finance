import datetime as dt
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    institution: Mapped[str]
    type: Mapped[str]
    last4: Mapped[str | None] = mapped_column(String(4))


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)


class Rule(Base):
    __tablename__ = "rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    match_text: Mapped[str]
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))


class Import(Base):
    """One row per uploaded file. Deleting it undoes the import (transactions cascade)."""

    __tablename__ = "imports"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    filename: Mapped[str]
    file_sha256: Mapped[str] = mapped_column(String(64))
    row_count: Mapped[int]
    imported_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("account_id", "dedup_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id", ondelete="CASCADE"))
    date: Mapped[dt.date]
    description_raw: Mapped[str]
    merchant: Mapped[str]
    merchant_key: Mapped[str] = mapped_column(index=True)  # cleaned merchant name, for learning categories
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # negative = money out
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    is_transfer: Mapped[bool]
    dedup_key: Mapped[str] = mapped_column(String(64))
