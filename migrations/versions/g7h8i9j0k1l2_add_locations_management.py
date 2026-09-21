"""add_locations_management

Revision ID: g7h8i9j0k1l2
Revises: 92e51d308f17
Create Date: 2026-09-16 19:50:45.954000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = '92e51d308f17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'locations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('telegram_destination_id', sa.Integer(), nullable=True),
        sa.Column('group_id', sa.Integer(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=True, server_default='1'),
        sa.Column('device_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['telegram_destination_id'], ['destinations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    op.create_index('idx_locations_name', 'locations', ['name'])
    op.create_index('idx_locations_enabled', 'locations', ['enabled'])
    
    with op.batch_alter_table('groups') as batch_op:
        batch_op.add_column(sa.Column('location_id', sa.Integer(), nullable=True))
    
    with op.batch_alter_table('devices') as batch_op:
        batch_op.add_column(sa.Column('location_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('devices') as batch_op:
        batch_op.drop_column('location_id')
    
    with op.batch_alter_table('groups') as batch_op:
        batch_op.drop_column('location_id')
    
    op.drop_index('idx_locations_enabled', table_name='locations')
    op.drop_index('idx_locations_name', table_name='locations')
    
    op.drop_table('locations')
