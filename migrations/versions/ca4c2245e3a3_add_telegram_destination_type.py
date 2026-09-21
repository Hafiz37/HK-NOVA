"""add_telegram_destination_type

Revision ID: ca4c2245e3a3
Revises: f6g7h8i9j0k1
Create Date: 2026-09-15 21:49:36.349512

Adds 'telegram' as a valid destination type.
SQLite does not enforce enum constraints, so no ALTER TYPE needed.
The new value is handled by the application layer.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca4c2245e3a3'
down_revision: Union[str, None] = 'f6g7h8i9j0k1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
