from app.security import get_current_user, require_admin
import os
import re
import time

import paramiko
from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.credential import Credential
from app.models.group import Group
from app.models.user import User
from app.modules.audit_service import AuditService

router = APIRouter(prefix="/credentials")


@router.get("/", dependencies=[Depends(require_admin)])
async def list_credentials(request: Request, db: Session = Depends(get_db)):
    credentials = db.query(Credential).order_by(Credential.name).all()
    return request.app.state.templates.TemplateResponse(
        request, "credentials/list.html", {"credentials": credentials},
    )


@router.get("/add", dependencies=[Depends(require_admin)])
async def add_credential_form(request: Request, db: Session = Depends(get_db)):
    return request.app.state.templates.TemplateResponse(
        request, "credentials/form.html",
        {"credential": None, "groups": db.query(Group).order_by(Group.name).all()},
    )


@router.post("/add")
async def add_credential(
    request: Request,
    name: str = Form(...),
    username: str = Form(""),
    password: str = Form(""),
    enable_secret: str = Form(""),
    ssh_key_path: str = Form(""),
    group: str = Form("default"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    cred = Credential(
        name=name,
        username=username.strip() or None,
        ssh_key_path=ssh_key_path or None,
        group=group or "default",
    )
    if password:
        cred.set_password(password)
    if enable_secret:
        cred.set_enable_secret(enable_secret)
    db.add(cred)
    db.commit()
    AuditService.log(
        db, action="CREATE", resource_type="credentials", user=actor,
        resource_id=cred.id, resource_name=cred.name, request=request,
        new_value={"name": cred.name, "username": cred.username, "group": cred.group,
                   "has_password": bool(cred.password_encrypted), "has_ssh_key": bool(cred.ssh_key_path)},
    )
    return RedirectResponse(url="/credentials", status_code=303)


@router.get("/{cred_id}/edit", dependencies=[Depends(require_admin)])
async def edit_credential_form(cred_id: int, request: Request, db: Session = Depends(get_db)):
    cred = db.get(Credential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    return request.app.state.templates.TemplateResponse(
        request, "credentials/form.html",
        {"credential": cred, "groups": db.query(Group).order_by(Group.name).all()},
    )


@router.post("/{cred_id}/edit")
async def edit_credential(
    cred_id: int,
    request: Request,
    name: str = Form(...),
    username: str = Form(""),
    password: str = Form(""),
    enable_secret: str = Form(""),
    ssh_key_path: str = Form(""),
    group: str = Form("default"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    cred = db.get(Credential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    old_value = {"name": cred.name, "username": cred.username, "group": cred.group,
                 "password_changed": False}
    cred.name = name
    cred.username = username.strip() or None
    cred.ssh_key_path = ssh_key_path or None
    cred.group = group or "default"
    if password:
        cred.set_password(password)
    if enable_secret:
        cred.set_enable_secret(enable_secret)
    db.commit()
    AuditService.log(
        db, action="UPDATE", resource_type="credentials", user=actor,
        resource_id=cred_id, resource_name=cred.name, request=request, old_value=old_value,
        new_value={"name": cred.name, "username": cred.username, "group": cred.group,
                   "password_changed": bool(password)},
    )
    return RedirectResponse(url="/credentials", status_code=303)


@router.post("/generate-ssh-key")
async def generate_ssh_key(
    request: Request,
    key_name: str = Form(...),
    cred_id: int | None = Form(None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    # Sanitize key_name: allow only alphanumeric, hyphens, underscores
    if not re.match(r'^[a-zA-Z0-9_-]+$', key_name):
        raise HTTPException(status_code=400, detail="Key name may only contain letters, numbers, hyphens, and underscores")

    cred = db.get(Credential, cred_id) if cred_id is not None else None
    if cred_id is not None and cred is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    settings = get_settings()
    ssh_key_dir = os.path.realpath(settings.SSH_KEY_DIR)
    os.makedirs(ssh_key_dir, mode=0o700, exist_ok=True)

    timestamp = int(time.time())
    filename = f"vibenet_{key_name}_{timestamp}"
    private_path = os.path.join(ssh_key_dir, filename)
    public_path = private_path + ".pub"

    # Path traversal protection
    if not os.path.realpath(private_path).startswith(ssh_key_dir):
        raise HTTPException(status_code=400, detail="Invalid key name")

    # Generate RSA 2048-bit key pair; audit records the actual size below.
    key = paramiko.RSAKey.generate(2048)

    # Save private key
    key.write_private_key_file(private_path)
    os.chmod(private_path, 0o600)

    # Build and save public key
    public_key = f"{key.get_name()} {key.get_base64()} vibenet-{key_name}"
    with open(public_path, "w") as f:
        f.write(public_key + "\n")
    os.chmod(public_path, 0o644)

    AuditService.log(
        db, action="GENERATE_SSH_KEY", resource_type="credentials", user=actor,
        resource_id=cred.id if cred is not None else None,
        resource_name=cred.name if cred is not None else key_name, request=request,
        new_value={"key_type": "RSA", "key_size": key.get_bits()},
    )
    return JSONResponse({
        "ssh_key_path": os.path.realpath(private_path),
        "public_key": public_key,
    })


@router.post("/{cred_id}/delete")
async def delete_credential(cred_id: int, request: Request, db: Session = Depends(get_db),
                            actor: User = Depends(require_admin)):
    from app.models.device import Device

    cred = db.get(Credential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    # Unlink devices that reference this credential before deleting
    db.query(Device).filter(Device.credential_id == cred_id).update(
        {"credential_id": None}, synchronize_session="fetch"
    )
    db.query(Device).filter(Device.proxy_credential_id == cred_id).update(
        {"proxy_credential_id": None}, synchronize_session="fetch"
    )
    name = cred.name
    db.delete(cred)
    db.commit()
    AuditService.log(
        db, action="DELETE", resource_type="credentials", user=actor,
        resource_id=cred_id, resource_name=name, request=request,
    )
    return RedirectResponse(url="/credentials", status_code=303)
