"""Router for viewing, filtering, and exporting audit logs."""
import csv
from datetime import datetime, timezone
import io
import json
from typing import Generator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.security import require_admin

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


def _apply_audit_filters(
    query,
    action: str | None = None,
    resource_type: str | None = None,
    username: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
):
    if action and action.strip():
        query = query.where(AuditLog.action == action.strip())

    if resource_type and resource_type.strip():
        query = query.where(AuditLog.resource_type == resource_type.strip())

    if username and username.strip():
        query = query.where(AuditLog.username.ilike(f"%{username.strip()}%"))

    if date_from and date_from.strip():
        try:
            from_dt = datetime.fromisoformat(date_from.strip())
            query = query.where(AuditLog.timestamp >= from_dt)
        except (ValueError, TypeError):
            pass

    if date_to and date_to.strip():
        try:
            to_dt = datetime.fromisoformat(date_to.strip())
            # If date only (no time), adjust to end of day
            if len(date_to.strip()) <= 10:
                to_dt = to_dt.replace(hour=23, minute=59, second=59)
            query = query.where(AuditLog.timestamp <= to_dt)
        except (ValueError, TypeError):
            pass

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            (AuditLog.resource_name.ilike(term))
            | (AuditLog.ip_address.ilike(term))
            | (AuditLog.old_value.ilike(term))
            | (AuditLog.new_value.ilike(term))
        )

    return query


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def list_audit_logs(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    username: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    base_query = select(AuditLog)
    filtered_query = _apply_audit_filters(
        base_query,
        action=action,
        resource_type=resource_type,
        username=username,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )

    # Count total
    count_subq = filtered_query.subquery()
    total = db.scalar(select(func.count()).select_from(count_subq)) or 0
    total_pages = max(1, (total + per_page - 1) // per_page)
    if page > total_pages:
        page = total_pages

    # Pagination
    logs_stmt = (
        filtered_query.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    logs = list(db.scalars(logs_stmt).all())

    # Filter dropdown options
    actions = list(db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action)).all())
    resource_types = list(db.scalars(select(AuditLog.resource_type).distinct().order_by(AuditLog.resource_type)).all())
    usernames = list(db.scalars(select(AuditLog.username).where(AuditLog.username.isnot(None)).distinct().order_by(AuditLog.username).limit(50)).all())

    start_idx = (page - 1) * per_page + 1 if total > 0 else 0
    end_idx = min(page * per_page, total)

    return request.app.state.templates.TemplateResponse(
        request,
        "audit_logs.html",
        {
            "logs": logs,
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
            "start_idx": start_idx,
            "end_idx": end_idx,
            "selected_action": action or "",
            "selected_resource_type": resource_type or "",
            "selected_username": username or "",
            "selected_date_from": date_from or "",
            "selected_date_to": date_to or "",
            "search": search or "",
            "actions": actions,
            "resource_types": resource_types,
            "usernames": usernames,
        },
    )


@router.get("/export")
async def export_audit_logs(
    request: Request,
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    username: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    base_query = select(AuditLog)
    filtered_query = _apply_audit_filters(
        base_query,
        action=action,
        resource_type=resource_type,
        username=username,
        date_from=date_from,
        date_to=date_to,
        search=search,
    ).order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())

    def csv_generator() -> Generator[str, None, None]:
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write CSV Header
        writer.writerow(["ID", "Timestamp (UTC)", "Username", "Action", "Resource Type", "Resource ID", "Resource Name", "IP Address", "Status"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Batch yield rows to keep memory footprint constant
        batch_size = 500
        offset = 0
        while True:
            batch = list(db.scalars(filtered_query.offset(offset).limit(batch_size)).all())
            if not batch:
                break
            for log in batch:
                writer.writerow([
                    log.id,
                    log.timestamp.strftime("%Y-%m-%d %H:%M:%S") if log.timestamp else "",
                    log.username or "",
                    log.action,
                    log.resource_type,
                    log.resource_id if log.resource_id is not None else "",
                    log.resource_name or "",
                    log.ip_address or "",
                    log.status,
                ])
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)
            offset += batch_size

    today_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"audit_logs_{today_str}.csv"

    return StreamingResponse(
        csv_generator(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{log_id}/details")
async def get_log_details(
    log_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    log = db.get(AuditLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log entry not found")

    old_val = None
    if log.old_value:
        try:
            old_val = json.loads(log.old_value)
        except Exception:
            old_val = log.old_value

    new_val = None
    if log.new_value:
        try:
            new_val = json.loads(log.new_value)
        except Exception:
            new_val = log.new_value

    return JSONResponse({
        "id": log.id,
        "timestamp": log.timestamp.strftime("%Y-%m-%d %H:%M:%S") if log.timestamp else "",
        "username": log.username,
        "user_id": log.user_id,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "resource_name": log.resource_name,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "status": log.status,
        "old_value": old_val,
        "new_value": new_val,
    })

