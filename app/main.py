import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from jinja2 import Environment, FileSystemLoader

from app.config import get_settings
from app.database import init_db
from app.modules.scheduler.manager import start_scheduler, stop_scheduler
from app.security import require_auth
from app.version import VERSION

logger = logging.getLogger("hk-nova")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Starting HK-NOVA...")

    # Create backup directory
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)

    # Create SSH key directory with restricted permissions
    os.makedirs(settings.SSH_KEY_DIR, mode=0o700, exist_ok=True)

    # Initialize database tables
    init_db()
    logger.info("Database initialized")

    # Create default local destination if none exists
    _ensure_default_destination()

    # Seed default group if none exists
    _ensure_default_group()

    # Start scheduler
    start_scheduler()

    # Register daily maintenance job (retention, cleanup, VACUUM)
    _register_maintenance_job()

    # Re-register any existing schedules
    _reload_schedules()

    # Load monitoring jobs for critical devices
    try:
        from app.modules.scheduler.loader import load_monitoring_jobs
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            await load_monitoring_jobs(db)
        finally:
            db.close()
    except Exception as e:
        logger.error("Failed to load monitoring jobs: %s", e)

    # AUTH_* only provisions an empty database; inspect the stored account.
    from app.database import SessionLocal
    from app.models.user import User, UserRole
    from app.security import verify_password
    with SessionLocal() as db:
        admin = db.query(User).filter(User.username == "admin", User.role == UserRole.admin).first()
        if admin and admin.is_active and verify_password("admin", admin.password_hash):
            logger.warning("DEFAULT ADMIN PASSWORD IN USE — change it on /profile before exposing to a network")

    logger.info("HK-NOVA started successfully")
    yield

    # Shutdown
    stop_scheduler()
    logger.info("HK-NOVA stopped")


def _ensure_default_destination():
    """Seed one destination per type so users can configure and enable them."""
    from app.database import SessionLocal
    from app.models.destination import Destination, DestinationType

    defaults = [
        {
            "name": "Local Storage",
            "dest_type": DestinationType.local,
            "config_json": {"path": get_settings().BACKUP_DIR},
            "enabled": True,
        },
        {
            "name": "Git Repository",
            "dest_type": DestinationType.git,
            "config_json": {
                "repo_path": "./repos/configs",
                "remote_url": "",
                "branch": "main",
                "auth_method": "token",
                "token": "",
            },
            "enabled": False,
        },
        {
            "name": "SMB Share",
            "dest_type": DestinationType.smb,
            "config_json": {
                "server": "",
                "share": "",
                "username": "",
                "password": "",
                "base_path": "backups",
            },
            "enabled": False,
        },
    ]

    db = SessionLocal()
    try:
        for dflt in defaults:
            exists = db.query(Destination).filter(
                Destination.dest_type == dflt["dest_type"]
            ).first()
            if not exists:
                dest = Destination(
                    name=dflt["name"],
                    dest_type=dflt["dest_type"],
                    config_json=dflt["config_json"],
                    retention_config={"daily": 14, "weekly": 6, "monthly": 12},
                    enabled=dflt["enabled"],
                )
                db.add(dest)
                logger.info("Created default destination: %s", dflt["name"])
        db.commit()
    finally:
        db.close()


def _ensure_default_group():
    """Seed the 'default' group if the groups table is empty."""
    from app.database import SessionLocal
    from app.models.group import Group

    db = SessionLocal()
    try:
        if not db.query(Group).first():
            db.add(Group(name="default", description="Default group"))
            db.commit()
            logger.info("Created default group")
    finally:
        db.close()


def _register_maintenance_job():
    """Register daily DB maintenance (retention sweep, history purge, VACUUM)."""
    from app.modules.scheduler.manager import scheduler
    from apscheduler.triggers.cron import CronTrigger

    async def _run_maintenance():
        from app.modules.maintenance import run_maintenance
        await run_maintenance()

    scheduler.add_job(
        _run_maintenance,
        trigger=CronTrigger(hour=3, minute=30),  # 3:30 AM daily
        id="db_maintenance",
        replace_existing=True,
    )
    logger.info("Registered daily maintenance job (03:30)")


def _reload_schedules():
    """Re-register all enabled schedules with APScheduler on startup."""
    from app.database import SessionLocal
    from app.models.job import Schedule
    from app.modules.scheduler.manager import add_backup_job
    from app.routers.jobs import _scheduled_backup_runner

    db = SessionLocal()
    try:
        schedules = db.query(Schedule).filter(Schedule.enabled == True).all()
        for s in schedules:
            try:
                add_backup_job(s.id, s.cron_expression, _scheduled_backup_runner, schedule_id=s.id)
            except Exception as e:
                logger.warning("Failed to reload schedule %s: %s", s.name, e)
    finally:
        db.close()


app = FastAPI(
    title="HK-NOVA",
    description="Network Device Configuration Backup Manager",
    version=VERSION,
    lifespan=lifespan,
    dependencies=[Depends(require_auth)],
    docs_url=None, redoc_url=None, openapi_url=None,
)

# CORS
# Security: Restrict CORS to specific origins
settings = get_settings()
# Parse comma-separated origins from env, default to localhost
cors_origins = getattr(settings, 'CORS_ORIGINS', 'http://localhost:5005,http://127.0.0.1:5005,http://0.0.0.0:5005').split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)

# Security headers apply to successful responses and auth/permission errors
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:"
    return response

# Authentication runs as a dependency, sharing get_db with route handlers.
# This also makes isolated database overrides apply consistently to auth and CRUD.

# Static files
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# Jinja2 templates
templates_dir = os.path.join(os.path.dirname(__file__), "templates")
from starlette.templating import Jinja2Templates
app.state.templates = Jinja2Templates(
    directory=templates_dir,
    context_processors=[lambda request: {"current_user": getattr(request.state, "user", None)}],
)
from app.security import can_edit, can_delete, can_trigger_backup, can_delete_destination
app.state.templates.env.globals.update(
    can_edit=can_edit, can_delete=can_delete,
    can_trigger_backup=can_trigger_backup, can_delete_destination=can_delete_destination,
)

from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exception_handlers import http_exception_handler

from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def safe_user_validation_error(request: Request, exc: RequestValidationError):
    # Pydantic's default payload includes the submitted value (possibly a password).
    if request.url.path.startswith(("/api/users", "/users", "/profile")) or request.url.path == "/login":
        errors = [{"loc": error["loc"], "msg": error["msg"], "type": error["type"]} for error in exc.errors()]
        return JSONResponse({"detail": errors}, status_code=422)
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(StarletteHTTPException)
async def permission_error(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 403 and not request.url.path.startswith("/api/"):
        return app.state.templates.TemplateResponse(request, "errors/403.html", {"detail": exc.detail}, status_code=403)
    return await http_exception_handler(request, exc)


# Make version available globally in templates
app.state.templates.env.globals["app_version"] = VERSION

# Jinja2 filter: convert UTC datetime to local timezone (from TZ env var)
from datetime import timezone as _tz
from zoneinfo import ZoneInfo as _ZI

_LOCAL_TZ = _ZI(os.environ.get("TZ", "America/Chicago"))

def _localtime(dt, fmt="%Y-%m-%d %H:%M:%S"):
    """Convert a UTC datetime to local time and format it."""
    if dt is None:
        return "-"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_tz.utc)
    return dt.astimezone(_LOCAL_TZ).strftime(fmt)


def _timeuntil(dt):
    """Return a human-readable 'in Xh Ym' string until a future datetime."""
    from datetime import datetime as _dt
    if dt is None:
        return ""
    now = _dt.now(_tz.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_tz.utc)
    diff = dt - now
    total = int(diff.total_seconds())
    if total <= 0:
        return "now"
    if total < 60:
        return f"in {total}s"
    if total < 3600:
        return f"in {total // 60}m"
    if total < 86400:
        h, m = divmod(total // 60, 60)
        return f"in {h}h {m}m" if m else f"in {h}h"
    d = total // 86400
    return f"in {d}d"


app.state.templates.env.filters["localtime"] = _localtime
app.state.templates.env.filters["timeuntil"] = _timeuntil

# Include routers
from app.routers import dashboard, devices, credentials, backups, jobs, destinations, api, groups, notifications, locations, analytics, diagnostics

app.include_router(dashboard.router)
app.include_router(devices.router)
app.include_router(credentials.router)
app.include_router(backups.router)
app.include_router(jobs.router)
app.include_router(destinations.router)
app.include_router(api.router)
app.include_router(groups.router)
app.include_router(notifications.router)
app.include_router(locations.router, prefix="/api/v1")
app.include_router(analytics.router)
app.include_router(diagnostics.router)

# Import analytics web router
from app.routers import users
app.include_router(users.router)

from app.routers import audit_logs
app.include_router(audit_logs.router)

from app.routers import analytics_web
app.include_router(analytics_web.router)


# Keep documentation protected as it was under the former auth middleware.
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

@app.get("/openapi.json", include_in_schema=False)
def openapi_schema():
    return JSONResponse(app.openapi())

@app.get("/docs", include_in_schema=False)
def swagger_docs():
    return get_swagger_ui_html(openapi_url="/openapi.json", title="HK-NOVA API")

@app.get("/redoc", include_in_schema=False)
def redoc_docs():
    return get_redoc_html(openapi_url="/openapi.json", title="HK-NOVA API")


# ── Login / Logout routes ─────────────────────────────────────────────
from fastapi import Form as FastForm
from fastapi.responses import RedirectResponse as RR
from app.security import authenticate_user, generate_session_token, get_current_user, _COOKIE_NAME, _SESSION_TTL
from app.models.user import User
from app.modules.audit_service import AuditService
from app.database import get_db
from sqlalchemy.orm import Session

@app.get("/login")
async def login_page(request: Request, next: str = "/"):
    return app.state.templates.TemplateResponse(
        request, "login.html", {"next": next, "error": None}
    )

@app.post("/login")
async def login_submit(
    request: Request,
    username: str = FastForm(...),
    password: str = FastForm(...),
    remember: str = FastForm(""),
    next: str = FastForm("/"),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, username, password)
    if user is None:
        logger.warning("Login failed for username=%r", username)
        AuditService.log(
            db, action="LOGIN_FAILED", resource_type="auth", user=None,
            resource_name=username, request=request, status="failed",
        )
        return app.state.templates.TemplateResponse(
            request,
            "login.html",
            {"next": next, "error": "Invalid username or password"},
            status_code=401,
        )
    token = generate_session_token(user.id)
    max_age = _SESSION_TTL if remember == "1" else None
    # Prevent open redirect: must be a relative path, not //evil.com
    from urllib.parse import urlparse
    parsed = urlparse(next)
    if parsed.scheme or parsed.netloc or not next.startswith("/") or next.startswith("//") or "\\" in next or any(ord(c) < 32 for c in next):
        next = "/"
    response = RR(url=next, status_code=303)
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    AuditService.log(
        db, action="LOGIN_SUCCESS", resource_type="auth", user=user,
        request=request, status="success",
    )
    return response

@app.get("/logout", include_in_schema=False)  # Compatibility for existing bookmarks.
@app.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    AuditService.log(
        db, action="LOGOUT", resource_type="auth", user=current_user,
        request=request, status="success",
    )
    response = RR(url="/login", status_code=303)
    response.delete_cookie(_COOKIE_NAME)
    return response


# Redirect /locations to /destinations for backward compatibility
@app.get("/locations")
async def locations_redirect():
    """Redirect old locations page to destinations"""
    return RR(url="/destinations", status_code=301)


def cli():
    """Entry point for `hk-nova` command and `python -m app.main`."""
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )


if __name__ == "__main__":
    cli()
