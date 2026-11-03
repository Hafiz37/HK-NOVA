import pytest
import pytest_asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.device import Device
from app.models.credential import Credential


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def db_engine():
    """Create a test database engine."""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_engine):
    """Create a fresh database session for each test."""
    SessionLocal = sessionmaker(bind=db_engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def sample_device():
    """Create a sample device for testing."""
    return Device(
        id=1,
        hostname="test-firewall",
        ip_address="192.168.1.1",
        device_type="pfsense",
        port=443,
        enabled=True,
    )


@pytest.fixture
def sample_credential():
    """Create a sample credential for testing."""
    cred = Credential(
        id=1,
        name="test-cred",
        username="admin",
        password_type="password",
    )
    # Set encrypted password (plaintext is "testpass")
    cred._password = cred.encrypt_password("testpass")
    return cred


@pytest.fixture(scope="session")
def user_password_hash():
    from app.security import hash_password
    return hash_password("test-password-123")


@pytest.fixture
def web_db(tmp_path, user_password_hash, monkeypatch):
    """Isolated request database; never touch the configured deployment database."""
    from app.models.user import User, UserRole
    from app.config import get_settings
    engine = create_engine(f"sqlite:///{tmp_path / 'web.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        for name, role in (("admin", UserRole.admin), ("operator", UserRole.operator), ("viewer", UserRole.viewer)):
            db.add(User(username=name, password_hash=user_password_hash, role=role, is_active=True))
        db.add(User(username="inactive", password_hash=user_password_hash, role=UserRole.viewer, is_active=False))
        db.commit()
    monkeypatch.setattr(get_settings(), "BACKUP_DIR", str(tmp_path / 'backups'))
    yield factory
    engine.dispose()


@pytest.fixture
def web_client(web_db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.routers.api import rate_limit

    def isolated_db():
        with web_db() as db:
            yield db

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = isolated_db
    app.dependency_overrides[rate_limit] = lambda: True
    # Do not start production scheduler/network jobs in HTTP tests.
    client = TestClient(app, follow_redirects=False)
    yield client
    client.close()
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
