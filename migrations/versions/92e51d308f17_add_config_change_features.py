"""add_config_change_features

Revision ID: 92e51d308f17
Revises: ca4c2245e3a3
Create Date: 2026-09-15 22:48:06.843265
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '92e51d308f17'
down_revision: Union[str, None] = 'ca4c2245e3a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notification_channels', 
        sa.Column('on_config_change', sa.Boolean(), nullable=False, server_default='1'))
    
    op.add_column('devices', 
        sa.Column('is_critical', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('devices', 
        sa.Column('monitoring_interval', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'monitoring_interval')
    op.drop_column('devices', 'is_critical')
    op.drop_column('notification_channels', 'on_config_change')
