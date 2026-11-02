"""add backup_failures table

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-11-02 20:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'backup_failures',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('backup_id', sa.Integer(), nullable=True),
        sa.Column('device_id', sa.Integer(), nullable=False),
        sa.Column('error_type', sa.String(length=50), nullable=False),
        sa.Column('error_category', sa.String(length=20), nullable=False),
        sa.Column('retry_count', sa.Integer(), nullable=True, default=0),
        sa.Column('max_retries', sa.Integer(), nullable=True, default=3),
        sa.Column('destination_type', sa.String(length=50), nullable=True),
        sa.Column('destination_name', sa.String(length=255), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_traceback', sa.Text(), nullable=True),
        sa.Column('root_cause_analysis', sa.Text(), nullable=True),
        sa.Column('suggested_solution', sa.Text(), nullable=True),
        sa.Column('auto_fix_attempted', sa.Boolean(), nullable=True, default=False),
        sa.Column('auto_fix_result', sa.Text(), nullable=True),
        sa.Column('resolved', sa.Boolean(), nullable=True, default=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['backup_id'], ['backups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_backup_failures_id', 'backup_failures', ['id'], unique=False)
    op.create_index('ix_backup_failures_backup_id', 'backup_failures', ['backup_id'], unique=False)
    op.create_index('ix_backup_failures_device_id', 'backup_failures', ['device_id'], unique=False)
    op.create_index('ix_backup_failures_error_type', 'backup_failures', ['error_type'], unique=False)
    op.create_index('ix_backup_failures_timestamp', 'backup_failures', ['timestamp'], unique=False)
    op.create_index('ix_backup_failures_device_id_resolved', 'backup_failures', ['device_id', 'resolved'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_backup_failures_device_id_resolved', table_name='backup_failures')
    op.drop_index('ix_backup_failures_timestamp', table_name='backup_failures')
    op.drop_index('ix_backup_failures_error_type', table_name='backup_failures')
    op.drop_index('ix_backup_failures_device_id', table_name='backup_failures')
    op.drop_index('ix_backup_failures_backup_id', table_name='backup_failures')
    op.drop_index('ix_backup_failures_id', table_name='backup_failures')
    op.drop_table('backup_failures')

