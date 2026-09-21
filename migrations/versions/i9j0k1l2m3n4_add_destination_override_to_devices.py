"""add destination_ids_override to devices

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-09-17 13:58:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('devices') as batch_op:
        batch_op.add_column(sa.Column('destination_ids_override', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('devices') as batch_op:
        batch_op.drop_column('destination_ids_override')
