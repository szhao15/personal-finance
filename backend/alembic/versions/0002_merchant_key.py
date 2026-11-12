"""add transactions.merchant_key for learning categories from history

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

from app.statements import merchant_key

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("merchant_key", sa.String, nullable=True))

    # Fill the new column for rows imported before this migration, then make it required.
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, merchant FROM transactions")).all()
    if rows:
        conn.execute(
            sa.text("UPDATE transactions SET merchant_key = :key WHERE id = :id"),
            [{"id": row_id, "key": merchant_key(merchant)} for row_id, merchant in rows],
        )
    op.alter_column("transactions", "merchant_key", nullable=False)
    op.create_index("ix_transactions_merchant_key", "transactions", ["merchant_key"])


def downgrade() -> None:
    op.drop_index("ix_transactions_merchant_key", table_name="transactions")
    op.drop_column("transactions", "merchant_key")
