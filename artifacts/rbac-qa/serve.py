"""Run the real app against disposable fixture data for browser verification."""
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
workspace = tempfile.TemporaryDirectory(prefix="hk-nova-rbac-ui-")
os.environ.update(TZ="Asia/Jakarta", DATABASE_URL=f"sqlite:///{workspace.name}/ui.db", SECRET_KEY="rbac-browser-verification-only-not-production", BACKUP_DIR=f"{workspace.name}/backups", SSH_KEY_DIR=f"{workspace.name}/ssh_keys")
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.user import User, UserRole
from app.models.device import Device
from app.models.destination import Destination, DestinationType
from app.security import hash_password

Base.metadata.create_all(engine)
with SessionLocal() as db:
    password = hash_password("Browser-check-123")
    for role in UserRole:
        db.add(User(username=f"demo-{role.value}", full_name=f"Demo {role.value.title()}", role=role, is_active=True, password_hash=password))
    db.add(Device(hostname="RBAC Demo Switch", ip_address="192.0.2.10", device_type="cisco_ios", enabled=False))
    db.add(Destination(name="Demo Local Storage", dest_type=DestinationType.local, enabled=False, config_json={"path": f"{workspace.name}/backups"}))
    db.commit()

if __name__ == "__main__":
    import uvicorn
    # No scheduler/network startup jobs; HTTP handlers/templates are unchanged.
    uvicorn.run(app, host="127.0.0.1", port=5027, lifespan="off", log_level="warning")
