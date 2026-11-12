"""add categories.parent_id for subcategories

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "parent_id")
