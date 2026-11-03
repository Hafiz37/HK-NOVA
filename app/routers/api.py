"""JSON REST API endpoints for programmatic access."""
from app.security import get_current_user, require_operator_or_admin, require_admin
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.modules.audit_service import AuditService
from app.models.user import User, UserRole
from app.models.device import Device
from app.models.credential import Credential
from app.models.backup import Backup, BackupStatus
from app.models.job import JobRun, Schedule
from app.models.destination import Destination
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceRead
from app.schemas.credential import CredentialCreate, CredentialUpdate, CredentialRead
from app.schemas.backup import BackupRead, BackupTrigger
from app.schemas.job import ScheduleCreate, ScheduleRead, JobRunRead
from app.schemas.destination import DestinationCreate, DestinationRead, TelegramBotTokenTest, TelegramBotTokenSave
from app.modules.backup_service import run_backup_for_device, run_backup_job
from app.rate_limiter import get_rate_limit_dependency

router = APIRouter(prefix="/api/v1")

# Apply rate limiting to all API routes (30 requests per minute)
rate_limit = get_rate_limit_dependency(requests_per_minute=30)
router.dependencies.append(Depends(rate_limit))


# --- Devices ---

@router.get("/devices", response_model=list[DeviceRead], dependencies=[Depends(get_current_user)])
async def api_list_devices(db: Session = Depends(get_db)):
    return db.query(Device).order_by(Device.hostname).all()


@router.post("/devices", response_model=DeviceRead, status_code=201)
async def api_create_device(request: Request, data: DeviceCreate, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    device = Device(**data.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    AuditService.log(db, action="CREATE", resource_type="devices", user=actor, request=request,
                     resource_id=device.id, resource_name=device.hostname,
                     new_value={"hostname": device.hostname, "ip_address": device.ip_address, "device_type": device.device_type})
    return device


@router.get("/devices/{device_id}", response_model=DeviceRead, dependencies=[Depends(get_current_user)])
async def api_get_device(device_id: int, db: Session = Depends(get_db)):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    return device


@router.put("/devices/{device_id}", response_model=DeviceRead)
async def api_update_device(request: Request, device_id: int, data: DeviceUpdate, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    changes = data.model_dump(exclude_unset=True)
    old_value = {key: ("***REDACTED***" if key == "notes" else getattr(device, key)) for key in changes}
    for key, value in changes.items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    AuditService.log(db, action="UPDATE", resource_type="devices", user=actor, request=request,
                     resource_id=device.id, resource_name=device.hostname, old_value=old_value,
                     new_value={key: ("***REDACTED***" if key == "notes" else getattr(device, key)) for key in changes})
    return device


@router.delete("/devices/{device_id}", status_code=204)
async def api_delete_device(request: Request, device_id: int, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    name = device.hostname
    db.delete(device)
    db.commit()
    AuditService.log(db, action="DELETE", resource_type="devices", user=actor, request=request,
                     resource_id=device_id, resource_name=name)


# --- Credentials ---

@router.get("/credentials", response_model=list[CredentialRead], dependencies=[Depends(require_admin)])
async def api_list_credentials(db: Session = Depends(get_db)):
    return db.query(Credential).order_by(Credential.name).all()


@router.post("/credentials", response_model=CredentialRead, status_code=201)
async def api_create_credential(request: Request, data: CredentialCreate, db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    cred = Credential(name=data.name, username=data.username, ssh_key_path=data.ssh_key_path)
    if data.password:
        cred.set_password(data.password)
    if data.enable_secret:
        cred.set_enable_secret(data.enable_secret)
    db.add(cred)
    db.commit()
    db.refresh(cred)
    AuditService.log(db, action="CREATE", resource_type="credentials", user=actor, request=request,
                     resource_id=cred.id, resource_name=cred.name, new_value={"name": cred.name, "username": cred.username, "group": cred.group, "has_password": bool(cred.password_encrypted), "has_ssh_key": bool(cred.ssh_key_path)})
    return cred


# --- Backups ---

@router.get("/backups", response_model=list[BackupRead], dependencies=[Depends(get_current_user)])
async def api_list_backups(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(Backup).order_by(Backup.timestamp.desc()).limit(limit).all()


@router.post("/backups/trigger", response_model=list[BackupRead])
async def api_trigger_backup(request: Request, data: BackupTrigger, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    results = []
    try:
        for device_id in data.device_ids:
            device = db.query(Device).get(device_id)
            if not device:
                continue
            backup = await run_backup_for_device(
                db, device,
                destination_ids=data.destination_ids,
                engine_override=data.engine_override,
            )
            results.append(backup)
    except Exception:
        db.rollback()
        AuditService.log(db, action="TRIGGER", resource_type="backups", user=actor, request=request,
                         resource_name="selected devices", status="failed",
                         new_value={"scope": "selected", "device_count": len(results)})
        raise
    AuditService.log(db, action="TRIGGER", resource_type="backups", user=actor, request=request,
                     resource_name="selected devices", new_value={"scope": "selected", "device_count": len(results)},
                     status="failed" if any(b.status == BackupStatus.failed for b in results) else "success")
    return results


@router.get("/backups/{backup_id}", response_model=BackupRead, dependencies=[Depends(get_current_user)])
async def api_get_backup(backup_id: int, db: Session = Depends(get_db)):
    backup = db.query(Backup).get(backup_id)
    if not backup:
        raise HTTPException(404, "Backup not found")
    return backup


# --- Schedules ---

@router.get("/schedules", response_model=list[ScheduleRead], dependencies=[Depends(get_current_user)])
async def api_list_schedules(db: Session = Depends(get_db)):
    return db.query(Schedule).order_by(Schedule.name).all()


@router.post("/schedules", response_model=ScheduleRead, status_code=201)
async def api_create_schedule(request: Request, data: ScheduleCreate, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    schedule = Schedule(**data.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    AuditService.log(db, action="CREATE", resource_type="schedules", user=actor, request=request,
                     resource_id=schedule.id, resource_name=schedule.name, new_value={"name": schedule.name, "cron_expression": schedule.cron_expression, "enabled": schedule.enabled})
    return schedule


# --- Job Runs ---

@router.get("/jobs", response_model=list[JobRunRead], dependencies=[Depends(get_current_user)])
async def api_list_job_runs(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(JobRun).order_by(JobRun.started_at.desc()).limit(limit).all()


# --- Destinations ---

@router.get("/destinations", response_model=list[DestinationRead], dependencies=[Depends(require_admin)])
async def api_list_destinations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    destinations = db.query(Destination).order_by(Destination.name).all()
    return [_destination_response(dest, current_user) for dest in destinations]


def _destination_response(dest: Destination, user: User) -> DestinationRead:
    result = DestinationRead.model_validate(dest)
    if user.role == UserRole.viewer:
        result.config_json = None
    return result


@router.post("/destinations", response_model=DestinationRead, status_code=201)
async def api_create_destination(request: Request, data: DestinationCreate, db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    dest = Destination(**data.model_dump())
    db.add(dest)
    db.commit()
    db.refresh(dest)
    AuditService.log(db, action="CREATE", resource_type="destinations", user=actor, request=request,
                     resource_id=dest.id, resource_name=dest.name, new_value={"name": dest.name, "dest_type": dest.dest_type.value, "enabled": dest.enabled, "config": "***REDACTED***"})
    return dest


@router.delete("/destinations/{dest_id}", status_code=204)
async def api_delete_destination(request: Request, 
    dest_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete destination (admin only)."""
    from app.security import can_delete_destination
    
    if not can_delete_destination(current_user):
        raise HTTPException(403, "Admin access required to delete destinations")
    
    dest = db.query(Destination).get(dest_id)
    if not dest:
        raise HTTPException(404, "Destination not found")
    
    name = dest.name
    db.delete(dest)
    db.commit()
    AuditService.log(db, action="DELETE", resource_type="destinations", user=current_user, request=request,
                     resource_id=dest_id, resource_name=name)


# --- Telegram Bot Token Management ---

@router.get("/destinations/telegram/default", response_model=DestinationRead | None, dependencies=[Depends(get_current_user)])
async def api_get_default_telegram(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get the first telegram destination (default bot token)."""
    from app.models.destination import DestinationType
    dest = db.query(Destination).filter(
        Destination.dest_type == DestinationType.telegram
    ).first()
    
    if not dest:
        return None
    
    return _destination_response(dest, current_user)


@router.post("/destinations/telegram/test")
async def api_test_telegram_bot_token(request: Request, data: TelegramBotTokenTest, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Test bot token without saving to database."""
    from app.modules.destinations.telegram import TelegramDestination
    
    backend = TelegramDestination()
    config = {"bot_token": data.bot_token, "chat_id": ""}
    
    try:
        result = await backend.test(config)
        AuditService.log(db, action="TEST", resource_type="destinations", user=actor, request=request,
                         resource_name="unsaved telegram", status="success" if result.get("ok") else "failed")
        return result
    except Exception as e:
        AuditService.log(db, action="TEST", resource_type="destinations", user=actor, request=request,
                         resource_name="unsaved telegram", status="failed")
        return {
            "ok": False,
            "steps": [{"step": "test", "ok": False, "msg": f"Error: {str(e)}"}]
        }


@router.post("/destinations/telegram/default", response_model=DestinationRead, status_code=201)
async def api_create_default_telegram(request: Request, data: TelegramBotTokenSave, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Create new default telegram destination (Main Channel)."""
    from app.models.destination import DestinationType
    
    existing = db.query(Destination).filter(
        Destination.dest_type == DestinationType.telegram
    ).first()
    
    if existing:
        raise HTTPException(400, "Default telegram destination already exists. Use PUT to update.")
    
    dest = Destination(
        name="Main Channel",
        dest_type=DestinationType.telegram,
        enabled=True,
        config_json={}
    )
    
    encrypted_token = dest.encrypt_token(data.bot_token)
    dest.config_json = {"bot_token": encrypted_token}
    
    db.add(dest)
    db.commit()
    db.refresh(dest)
    AuditService.log(db, action="CREATE", resource_type="destinations", user=actor, request=request,
                     resource_id=dest.id, resource_name=dest.name, new_value={"name": dest.name, "dest_type": dest.dest_type.value, "enabled": dest.enabled, "config": "***REDACTED***"})
    
    return dest


@router.put("/destinations/telegram/default", response_model=DestinationRead)
async def api_update_default_telegram(request: Request, data: TelegramBotTokenSave, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Update existing default telegram destination."""
    from app.models.destination import DestinationType
    
    dest = db.query(Destination).filter(
        Destination.dest_type == DestinationType.telegram
    ).first()
    
    if not dest:
        raise HTTPException(404, "Default telegram destination not found. Use POST to create.")
    
    old_value = {"name": dest.name, "config": "***REDACTED***"}
    if data.bot_token:
        if not dest.config_json:
            dest.config_json = {}
        dest.config_json = {**dest.config_json, "bot_token": dest.encrypt_token(data.bot_token)}
    
    db.commit()
    db.refresh(dest)
    AuditService.log(db, action="UPDATE", resource_type="destinations", user=actor, request=request,
                     resource_id=dest.id, resource_name=dest.name, old_value=old_value, new_value={"name": dest.name, "config": "***REDACTED***"})
    
    return dest


# --- Retention ---

@router.post("/retention/sweep")
async def api_retention_sweep(request: Request, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    from app.modules.retention.manager import run_retention_sweep
    try:
        results = await run_retention_sweep(db)
    except Exception:
        db.rollback()
        AuditService.log(db, action="RUN", resource_type="backups", user=actor, request=request,
                         resource_name="retention sweep", status="failed")
        raise
    AuditService.log(db, action="RUN", resource_type="backups", user=actor, request=request,
                     resource_name="retention sweep")
    return results


# --- Maintenance ---

@router.post("/maintenance/run")
async def api_run_maintenance(request: Request, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Run full DB maintenance: retention, cleanup, VACUUM."""
    from app.modules.maintenance import run_maintenance
    try:
        results = await run_maintenance()
    except Exception:
        db.rollback()
        AuditService.log(db, action="RUN", resource_type="backups", user=actor, request=request,
                         resource_name="maintenance", status="failed")
        raise
    AuditService.log(db, action="RUN", resource_type="backups", user=actor, request=request,
                     resource_name="maintenance")
    return results


# --- Global Search ---

@router.get("/search", dependencies=[Depends(get_current_user)])
async def api_global_search(
    q: str = Query(..., min_length=2),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Global search across devices, backups, and schedules.
    Returns results for command palette and search features.
    """
    from sqlalchemy import or_
    
    query = f"%{q}%"
    
    # Search devices
    devices = db.query(Device).filter(
        or_(
            Device.hostname.ilike(query),
            Device.ip_address.ilike(query),
            Device.device_type.ilike(query),
            Device.notes.ilike(query)
        )
    ).limit(limit).all()
    
    # Search backups (by device hostname)
    backups = db.query(Backup).join(Device).filter(
        Device.hostname.ilike(query)
    ).order_by(Backup.timestamp.desc()).limit(limit).all()
    
    # Search schedules
    schedules = db.query(Schedule).filter(
        or_(
            Schedule.name.ilike(query),
            Schedule.device_group.ilike(query)
        )
    ).limit(limit).all()
    
    return {
        "query": q,
        "devices": [
            {
                "id": d.id,
                "hostname": d.hostname,
                "ip_address": d.ip_address,
                "device_type": d.device_type,
                "group": d.group
            }
            for d in devices
        ],
        "backups": [
            {
                "id": b.id,
                "device_id": b.device_id,
                "device_hostname": db.query(Device).get(b.device_id).hostname if db.query(Device).get(b.device_id) else "Unknown",
                "timestamp": b.timestamp.isoformat(),
                "status": b.status.value
            }
            for b in backups
        ],
        "jobs": [
            {
                "id": s.id,
                "name": s.name,
                "cron_expression": s.cron_expression,
                "enabled": s.enabled
            }
            for s in schedules
        ]
    }
