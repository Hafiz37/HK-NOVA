from app.security import get_current_user, require_operator_or_admin
import json
import logging

import httpx
from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.device import Device, DEVICE_TYPES, oxidized_model_to_device_type
from app.models.credential import Credential
from app.models.backup import Backup, BackupStatus
from app.models.group import Group
from app.models.destination import Destination
from app.models.user import User
from app.modules.audit_service import AuditService, REDACTED
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/devices")

ENGINE_TYPES = {
    "netmiko": "Netmiko (SSH — network devices)",
    "scp": "SCP (Paramiko — file pull via SSH)",
    "oxidized": "Oxidized (REST API)",
    "pfsense": "pfSense / OPNsense (Web API)",
    "proxmox": "Proxmox VE (SFTP — config file backup as .tar.gz)",
}


# Explicit metadata allowlist: never serialize device relationships/credentials.
_DEVICE_AUDIT_FIELDS = (
    "hostname", "ip_address", "device_type", "credential_id", "group",
    "backup_engine", "port", "proxy_host", "proxy_port", "proxy_credential_id",
    "notes", "enabled", "is_critical", "monitoring_interval", "destination_ids_override",
)


def _audit_device(db: Session, request: Request, actor: User, action: str, **metadata) -> None:
    # AuditService already contains persistence failures; this also isolates any
    # unexpected integration failure without logging exception payloads/secrets.
    try:
        AuditService.log(db, action=action, resource_type="devices", user=actor,
                         request=request, **metadata)
    except Exception as exc:
        logger.warning("Device audit could not be recorded (%s)", type(exc).__name__)


# ── List & Add (static paths — must come before /{device_id}) ────────


@router.get("/", dependencies=[Depends(get_current_user)])
async def list_devices(request: Request, db: Session = Depends(get_db)):
    devices = db.query(Device).order_by(Device.hostname).all()
    credentials = db.query(Credential).order_by(Credential.name).all()
    groups = db.query(Group).order_by(Group.name).all()
    return request.app.state.templates.TemplateResponse(
        request,
        "devices/list.html",
        {
            "devices": devices,
            "device_type_labels": DEVICE_TYPES,
            "credentials": credentials,
            "groups": groups,
        },
    )


@router.post("/batch-edit")
async def batch_edit_devices(
    request: Request,
    device_ids: str = Form(""),
    credential_id: str = Form(""),
    group: str = Form(""),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    ids = [int(x) for x in device_ids.split(",") if x.strip().isdigit()]
    if not ids:
        return RedirectResponse(url="/devices", status_code=303)

    devices = db.query(Device).filter(Device.id.in_(ids)).all()
    for device in devices:
        if credential_id == "__none__":
            device.credential_id = None
        elif credential_id:
            device.credential_id = int(credential_id)
        if group:
            device.group = group
    db.commit()
    fields_updated = [field for field, selected in (("credential_id", credential_id), ("group", group)) if selected]
    _audit_device(db, request, actor, "BATCH_EDIT", resource_name=f"{len(devices)} devices",
                  new_value={"fields_updated": fields_updated, "device_count": len(devices)})
    return RedirectResponse(url="/devices", status_code=303)


@router.get("/add", dependencies=[Depends(require_operator_or_admin)])
async def add_device_form(request: Request, db: Session = Depends(get_db)):
    credentials = db.query(Credential).order_by(Credential.name).all()
    destinations = db.query(Destination).order_by(
        Destination.enabled.desc(),
        Destination.name
    ).all()
    return request.app.state.templates.TemplateResponse(
        request,
        "devices/form.html",
        {
            "device": None,
            "credentials": credentials,
            "destinations": destinations,
            "device_types": DEVICE_TYPES,
            "engine_types": ENGINE_TYPES,
            "groups": db.query(Group).order_by(Group.name).all(),
            "active_destination_ids": [],
        },
    )


@router.post("/add")
async def add_device(
    request: Request,
    hostname: str = Form(...),
    ip_address: str = Form(...),
    device_type: str = Form("ruckus_fastiron"),
    credential_id: int = Form(None),
    group: str = Form("default"),
    backup_engine: str = Form("netmiko"),
    port: int = Form(22),
    proxy_host: str = Form(""),
    proxy_port: int = Form(None),
    proxy_credential_id: int = Form(None),
    notes: str = Form(""),
    is_critical: str = Form(""),
    monitoring_interval: int = Form(None),
    destination_ids: list[int] = Form(default=[]),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="Port must be between 1 and 65535")
    
    group_obj = db.query(Group).filter(Group.name == group).first()
    group_dest_ids = set(group_obj.destination_ids) if group_obj and group_obj.destination_ids else set()
    user_dest_ids = set(destination_ids)
    
    if group_dest_ids:
        missing = group_dest_ids - user_dest_ids
        if missing:
            user_dest_ids = user_dest_ids.union(group_dest_ids)
            destination_ids = list(user_dest_ids)
        
        extras = user_dest_ids - group_dest_ids
        if extras:
            device_override = list(user_dest_ids)
        else:
            device_override = None
    else:
        if not destination_ids:
            raise HTTPException(
                status_code=400, 
                detail="Group has no default destinations. Please select at least 1."
            )
        device_override = destination_ids
    
    device = Device(
        hostname=hostname,
        ip_address=ip_address,
        device_type=device_type,
        credential_id=credential_id if credential_id else None,
        group=group,
        backup_engine=backup_engine,
        port=port,
        proxy_host=proxy_host.strip() or None,
        proxy_port=proxy_port if proxy_port else None,
        proxy_credential_id=proxy_credential_id if proxy_credential_id else None,
        notes=notes or None,
        is_critical=is_critical == "1",
        monitoring_interval=monitoring_interval if monitoring_interval and monitoring_interval > 0 else None,
        destination_ids_override=device_override,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    _audit_device(db, request, actor, "CREATE", resource_id=device.id, resource_name=device.hostname,
                  new_value={"hostname": device.hostname, "ip_address": device.ip_address,
                             "vendor": None, "device_type": device.device_type, "location_id": None})
    
    if device.is_critical:
        try:
            from app.modules.scheduler.loader import load_monitoring_jobs
            await load_monitoring_jobs(db)
        except Exception as e:
            logger.error("Failed to reload monitoring jobs: %s", e)
    
    return RedirectResponse(url=f"/devices/{device.id}", status_code=303)


# ── Test all connections (static path — before /{device_id}) ─────────


@router.get("/test-all", dependencies=[Depends(require_operator_or_admin)])
async def test_all_page(request: Request, db: Session = Depends(get_db)):
    devices = db.query(Device).filter(Device.enabled == True).order_by(Device.hostname).all()
    return request.app.state.templates.TemplateResponse(
        request,
        "devices/test_all.html",
        {"devices": devices, "device_type_labels": DEVICE_TYPES},
    )


# ── Import from Oxidized (static path — before /{device_id}) ────────


@router.get("/import/oxidized", dependencies=[Depends(require_operator_or_admin)])
async def import_oxidized_form(request: Request, db: Session = Depends(get_db)):
    """Fetch node list from Oxidized and show import form."""
    oxidized_url = get_settings().OXIDIZED_URL.rstrip("/")
    nodes = []
    error = None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{oxidized_url}/nodes.json")
            resp.raise_for_status()
            nodes = resp.json()
    except httpx.ConnectError:
        error = f"Cannot connect to Oxidized at {oxidized_url}"
    except httpx.HTTPStatusError as e:
        error = f"Oxidized returned HTTP {e.response.status_code}"
    except Exception as e:
        error = f"Error fetching from Oxidized: {e}"

    # Mark which nodes already exist in our DB (by IP or hostname)
    existing_ips = {d.ip_address for d in db.query(Device).all()}
    existing_hosts = {d.hostname for d in db.query(Device).all()}
    for node in nodes:
        ip = node.get("ip", "")
        name = node.get("name", "")
        node["already_exists"] = ip in existing_ips or name in existing_hosts
        node["mapped_type"] = oxidized_model_to_device_type(node.get("model", "generic"))
        node["mapped_label"] = DEVICE_TYPES.get(node["mapped_type"], node["mapped_type"])
        # Normalize port: oxidized may return int, string, or omit it
        try:
            node["port"] = int(node.get("port") or 22)
        except (ValueError, TypeError):
            node["port"] = 22

    credentials = db.query(Credential).order_by(Credential.name).all()

    return request.app.state.templates.TemplateResponse(
        request,
        "devices/import_oxidized.html",
        {
            "nodes": nodes,
            "error": error,
            "oxidized_url": oxidized_url,
            "credentials": credentials,
        },
    )


@router.post("/import/oxidized")
async def import_oxidized_submit(
    request: Request,
    credential_id: int = Form(None),
    backup_engine: str = Form("oxidized"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Import selected nodes from Oxidized into the device database."""
    form = await request.form()

    imported = 0
    skipped = 0
    existing = db.query(Device).all()
    seen_ips = {device.ip_address for device in existing}
    seen_hosts = {device.hostname for device in existing}
    for key, value in form.multi_items():
        if not key.startswith("node_"):
            continue
        try:
            node = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            skipped += 1
            continue
        if not isinstance(node, dict) or any(
            not isinstance(node.get(field, ""), str) for field in ("ip", "name", "model", "group")
            if node.get(field) is not None
        ):
            skipped += 1
            continue

        ip = (node.get("ip") or "").strip()
        name = (node.get("name") or "").strip()
        model = node.get("model") or "generic"
        group = node.get("group", "default") or "default"
        # Port from oxidized node data — non-22 indicates a jump-host forwarded port
        try:
            port = int(node.get("port") or 22)
        except (ValueError, TypeError):
            port = 22

        if not ip and not name:
            skipped += 1
            continue

        ip, name = ip or name, name or ip
        if ip in seen_ips or name in seen_hosts:
            skipped += 1
            continue

        device = Device(
            hostname=name or ip,
            ip_address=ip or name,
            device_type=oxidized_model_to_device_type(model),
            credential_id=credential_id if credential_id else None,
            group=group,
            backup_engine=backup_engine,
            port=port,
            notes=f"Imported from Oxidized (model: {model})",
        )
        db.add(device)
        seen_ips.add(ip)
        seen_hosts.add(name)
        imported += 1

    db.commit()
    _audit_device(db, request, actor, "IMPORT",
                  new_value={"source": "oxidized", "imported_count": imported, "skipped_count": skipped})

    return RedirectResponse(url="/devices", status_code=303)


# ── Device detail & edit (dynamic /{device_id} paths — MUST be last) ─


@router.get("/{device_id}", dependencies=[Depends(get_current_user)])
async def device_detail(device_id: int, request: Request, db: Session = Depends(get_db)):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    recent_backups = (
        db.query(Backup)
        .filter(Backup.device_id == device_id)
        .order_by(Backup.timestamp.desc())
        .limit(20)
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        request,
        "devices/detail.html",
        {
            "device": device,
            "backups": recent_backups,
            "device_type_labels": DEVICE_TYPES,
        },
    )


@router.get("/{device_id}/clone", dependencies=[Depends(require_operator_or_admin)])
async def clone_device_form(device_id: int, request: Request, db: Session = Depends(get_db)):
    source = db.query(Device).get(device_id)
    if not source:
        raise HTTPException(status_code=404, detail="Device not found")
    credentials = db.query(Credential).order_by(Credential.name).all()
    destinations = db.query(Destination).order_by(
        Destination.enabled.desc(),
        Destination.name
    ).all()
    
    # Get active destination IDs from source device for cloning
    active_destination_ids = source.get_active_destination_ids(db)
    
    return request.app.state.templates.TemplateResponse(
        request,
        "devices/form.html",
        {
            "device": None,
            "clone": source,
            "credentials": credentials,
            "destinations": destinations,
            "device_types": DEVICE_TYPES,
            "engine_types": ENGINE_TYPES,
            "groups": db.query(Group).order_by(Group.name).all(),
            "active_destination_ids": active_destination_ids,
        },
    )


@router.get("/{device_id}/edit", dependencies=[Depends(require_operator_or_admin)])
async def edit_device_form(device_id: int, request: Request, db: Session = Depends(get_db)):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    credentials = db.query(Credential).order_by(Credential.name).all()
    destinations = db.query(Destination).order_by(
        Destination.enabled.desc(),
        Destination.name
    ).all()
    
    # Get active destination IDs (group defaults + override)
    active_destination_ids = device.get_active_destination_ids(db)
    
    return request.app.state.templates.TemplateResponse(
        request,
        "devices/form.html",
        {
            "device": device,
            "credentials": credentials,
            "destinations": destinations,
            "device_types": DEVICE_TYPES,
            "engine_types": ENGINE_TYPES,
            "groups": db.query(Group).order_by(Group.name).all(),
            "active_destination_ids": active_destination_ids,
        },
    )


@router.post("/{device_id}/edit")
async def edit_device(
    device_id: int,
    request: Request,
    hostname: str = Form(...),
    ip_address: str = Form(...),
    device_type: str = Form("ruckus_fastiron"),
    credential_id: int = Form(None),
    group: str = Form("default"),
    backup_engine: str = Form("netmiko"),
    port: int = Form(22),
    proxy_host: str = Form(""),
    proxy_port: int = Form(None),
    proxy_credential_id: int = Form(None),
    notes: str = Form(""),
    enabled: bool = Form(True),
    is_critical: str = Form(""),
    monitoring_interval: int = Form(None),
    destination_ids: list[int] = Form(default=[]),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="Port must be between 1 and 65535")
    
    old_values = {field: getattr(device, field) for field in _DEVICE_AUDIT_FIELDS}
    old_is_critical = device.is_critical
    old_monitoring_interval = device.monitoring_interval
    
    group_obj = db.query(Group).filter(Group.name == group).first()
    group_dest_ids = set(group_obj.destination_ids) if group_obj and group_obj.destination_ids else set()
    user_dest_ids = set(destination_ids)
    
    if group_dest_ids:
        missing = group_dest_ids - user_dest_ids
        if missing:
            user_dest_ids = user_dest_ids.union(group_dest_ids)
            destination_ids = list(user_dest_ids)
        
        extras = user_dest_ids - group_dest_ids
        if extras:
            device_override = list(user_dest_ids)
        else:
            device_override = None
    else:
        if not destination_ids:
            raise HTTPException(
                status_code=400, 
                detail="Group has no default destinations. Please select at least 1."
            )
        device_override = destination_ids
    
    device.hostname = hostname
    device.ip_address = ip_address
    device.device_type = device_type
    device.credential_id = credential_id if credential_id else None
    device.group = group
    device.backup_engine = backup_engine
    device.port = port
    device.proxy_host = proxy_host.strip() or None
    device.proxy_port = proxy_port if proxy_port else None
    device.proxy_credential_id = proxy_credential_id if proxy_credential_id else None
    device.notes = notes or None
    device.enabled = enabled
    device.is_critical = is_critical == "1"
    device.monitoring_interval = monitoring_interval if monitoring_interval and monitoring_interval > 0 else None
    device.destination_ids_override = device_override
    new_values = {field: getattr(device, field) for field in _DEVICE_AUDIT_FIELDS}
    changed = [field for field in _DEVICE_AUDIT_FIELDS if old_values[field] != new_values[field]]
    old_value = {field: REDACTED if field == "notes" else old_values[field] for field in changed}
    new_value = {field: REDACTED if field == "notes" else new_values[field] for field in changed}
    db.commit()
    _audit_device(db, request, actor, "UPDATE", resource_id=device.id, resource_name=device.hostname,
                  old_value=old_value, new_value=new_value)
    
    if (device.is_critical != old_is_critical or 
        device.monitoring_interval != old_monitoring_interval or
        (device.is_critical and not device.enabled)):
        try:
            from app.modules.scheduler.loader import load_monitoring_jobs
            await load_monitoring_jobs(db)
        except Exception as e:
            logger.error("Failed to reload monitoring jobs: %s", e)
    
    return RedirectResponse(url=f"/devices/{device.id}", status_code=303)


@router.post("/{device_id}/delete")
async def delete_device(device_id: int, request: Request, db: Session = Depends(get_db),
                        actor: User = Depends(require_operator_or_admin)):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    hostname = device.hostname
    db.delete(device)
    db.commit()
    _audit_device(db, request, actor, "DELETE", resource_id=device_id, resource_name=hostname)
    return RedirectResponse(url="/devices", status_code=303)


@router.post("/{device_id}/test")
async def test_device_connection(device_id: int, request: Request, db: Session = Depends(get_db),
                                 actor: User = Depends(require_operator_or_admin)):
    device = db.query(Device).get(device_id)
    if not device:
        _audit_device(db, request, actor, "TEST_CONNECTION", resource_id=device_id, status="failed")
        return HTMLResponse('<span class="badge bg-danger">Device not found</span>')

    status = "failed"
    if not device.credential:
        response = HTMLResponse('<span class="badge bg-warning">No credential assigned</span>')
    else:
        try:
            from app.modules.engines import get_engine
            engine = get_engine(device.backup_engine)
            result = await engine.test_connection(device, device.credential)
            if result:
                status = "success"
                response = HTMLResponse('<span class="badge bg-success">Connection OK</span>')
            else:
                response = HTMLResponse('<span class="badge bg-danger">Connection Failed</span>')
        except Exception:
            response = HTMLResponse('<span class="badge bg-danger">Connection error</span>')
    _audit_device(db, request, actor, "TEST_CONNECTION", resource_id=device_id,
                  resource_name=device.hostname, status=status)
    return response
