"""add_description_to_destinations

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-09-16 18:10:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('destinations') as batch_op:
        batch_op.add_column(sa.Column('description', sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('destinations') as batch_op:
        batch_op.drop_column('description')
