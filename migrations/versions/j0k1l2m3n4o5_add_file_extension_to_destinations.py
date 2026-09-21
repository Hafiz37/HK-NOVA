"""add file_extension to destination configs

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-09-18 14:09:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import json

revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add file_extension='cfg' to all existing destinations that don't have it"""
    
    # Get database connection
    bind = op.get_bind()
    
    # SQLite: Update JSON fields manually via Python
    result = bind.execute(sa.text("SELECT id, config_json FROM destinations"))
    destinations = result.fetchall()
    
    for dest_id, config_json_str in destinations:
        if config_json_str:
            config = json.loads(config_json_str)
        else:
            config = {}
        
        # Add file_extension if not present
        if "file_extension" not in config:
            config["file_extension"] = "cfg"
            
            # Update back to database
            bind.execute(
                sa.text("UPDATE destinations SET config_json = :config WHERE id = :id"),
                {"config": json.dumps(config), "id": dest_id}
            )
    
    print("✅ Migration complete: Added default file_extension='cfg' to existing destinations")


def downgrade() -> None:
    """Remove file_extension from all destinations"""
    
    bind = op.get_bind()
    result = bind.execute(sa.text("SELECT id, config_json FROM destinations"))
    destinations = result.fetchall()
    
    for dest_id, config_json_str in destinations:
        if config_json_str:
            config = json.loads(config_json_str)
            
            # Remove file_extension if present
            if "file_extension" in config:
                del config["file_extension"]
                
                bind.execute(
                    sa.text("UPDATE destinations SET config_json = :config WHERE id = :id"),
                    {"config": json.dumps(config), "id": dest_id}
                )
