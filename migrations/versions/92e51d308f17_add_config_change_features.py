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
    # Earlier installations created this table via metadata.create_all, but the
    # original Alembic chain never did. Support a genuinely empty database too.
    if not sa.inspect(op.get_bind()).has_table('notification_channels'):
        op.create_table(
            'notification_channels',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(255), nullable=False, unique=True),
            sa.Column('apprise_url_encrypted', sa.String(1000), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=True),
            sa.Column('on_success', sa.Boolean(), nullable=True),
            sa.Column('on_failure', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_notification_channels_id', 'notification_channels', ['id'])
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
