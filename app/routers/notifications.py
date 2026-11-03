from app.security import get_current_user, require_operator_or_admin
from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.audit_service import AuditService
from app.models.user import User
from app.models.notification import NotificationChannel

router = APIRouter(prefix="/notifications")


def _channel_metadata(ch):
    return {"name": ch.name, "enabled": ch.enabled, "on_success": ch.on_success,
            "on_failure": ch.on_failure, "on_config_change": ch.on_config_change}


@router.get("/", dependencies=[Depends(get_current_user)])
async def list_notifications(request: Request, db: Session = Depends(get_db)):
    channels = db.query(NotificationChannel).order_by(NotificationChannel.name).all()
    return request.app.state.templates.TemplateResponse(
        request, "notifications/list.html", {"channels": channels},
    )


@router.get("/add", dependencies=[Depends(require_operator_or_admin)])
async def add_notification_form(request: Request):
    return request.app.state.templates.TemplateResponse(
        request, "notifications/form.html", {"channel": None},
    )


@router.post("/add")
async def add_notification(request: Request, 
    name: str = Form(...),
    apprise_url: str = Form(...),
    on_success: str = Form(""),
    on_failure: str = Form(""),
    on_config_change: str = Form(""),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    ch = NotificationChannel(
        name=name.strip(),
        enabled=True,
        on_success=on_success == "1",
        on_failure=on_failure == "1",
        on_config_change=on_config_change == "1",
    )
    ch.set_url(apprise_url.strip())
    db.add(ch)
    db.commit()
    AuditService.log(db, action="CREATE", resource_type="notifications", user=actor, request=request,
                     resource_id=ch.id, resource_name=ch.name, new_value=_channel_metadata(ch))
    return RedirectResponse(url="/notifications", status_code=303)


@router.get("/{channel_id}/edit", dependencies=[Depends(require_operator_or_admin)])
async def edit_notification_form(channel_id: int, request: Request, db: Session = Depends(get_db)):
    ch = db.query(NotificationChannel).get(channel_id)
    if not ch:
        return RedirectResponse(url="/notifications", status_code=303)
    return request.app.state.templates.TemplateResponse(
        request, "notifications/form.html", {"channel": ch},
    )


@router.post("/{channel_id}/edit")
async def edit_notification(request: Request, 
    channel_id: int,
    name: str = Form(...),
    apprise_url: str = Form(""),
    on_success: str = Form(""),
    on_failure: str = Form(""),
    on_config_change: str = Form(""),
    enabled: str = Form("true"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    ch = db.query(NotificationChannel).get(channel_id)
    if not ch:
        return RedirectResponse(url="/notifications", status_code=303)
    old_value = _channel_metadata(ch)
    ch.name = name.strip()
    ch.on_success = on_success == "1"
    ch.on_failure = on_failure == "1"
    ch.on_config_change = on_config_change == "1"
    ch.enabled = enabled == "true"
    if apprise_url.strip():
        ch.set_url(apprise_url.strip())
    db.commit()
    AuditService.log(db, action="UPDATE", resource_type="notifications", user=actor, request=request,
                     resource_id=ch.id, resource_name=ch.name, old_value=old_value, new_value={**_channel_metadata(ch), "url_updated": bool(apprise_url.strip())})
    return RedirectResponse(url="/notifications", status_code=303)


@router.post("/{channel_id}/delete")
async def delete_notification(request: Request, channel_id: int, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    ch = db.query(NotificationChannel).get(channel_id)
    if ch:
        metadata = _channel_metadata(ch)
        db.delete(ch)
        db.commit()
        AuditService.log(db, action="DELETE", resource_type="notifications", user=actor, request=request,
                         resource_id=ch.id, resource_name=ch.name, old_value=metadata)
    return RedirectResponse(url="/notifications", status_code=303)


@router.post("/{channel_id}/test")
async def test_notification_endpoint(request: Request, channel_id: int, db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    ch = db.query(NotificationChannel).get(channel_id)
    if not ch:
        return HTMLResponse('<span class="badge bg-danger">Channel not found</span>')

    from app.modules.notifications import test_notification
    try:
        url = ch.get_url()
    except Exception:
        AuditService.log(db, action="TEST", resource_type="notifications", user=actor, request=request,
                         resource_id=ch.id, resource_name=ch.name, status="failed")
        return HTMLResponse('<span class="badge bg-danger">Failed to decrypt URL</span>')

    try:
        ok, msg = await test_notification(url)
    except Exception:
        AuditService.log(db, action="TEST", resource_type="notifications", user=actor, request=request,
                         resource_id=ch.id, resource_name=ch.name, status="failed")
        raise
    AuditService.log(db, action="TEST", resource_type="notifications", user=actor, request=request,
                     resource_id=ch.id, resource_name=ch.name, status="success" if ok else "failed")
    if ok:
        return HTMLResponse(f'<span class="badge bg-success">{msg}</span>')
    return HTMLResponse(f'<span class="badge bg-danger">{msg}</span>')
