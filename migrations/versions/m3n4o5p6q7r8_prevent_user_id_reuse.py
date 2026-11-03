"""Prevent SQLite from reusing deleted user/session identities.

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
"""
from alembic import op
import sqlalchemy as sa

revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        ddl = connection.execute(sa.text("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'" )).scalar_one()
        if "AUTOINCREMENT" not in ddl.upper():
            with op.batch_alter_table("users", recreate="always", table_kwargs={"sqlite_autoincrement": True}):
                pass
    # PostgreSQL's sequence already assigns monotonically increasing IDs.


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("users", recreate="always", table_kwargs={"sqlite_autoincrement": False}):
            pass
