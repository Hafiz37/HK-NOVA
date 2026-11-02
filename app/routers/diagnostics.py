import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import and_, desc, asc, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.backup import Backup, BackupStatus
from app.models.backup_failure import BackupFailure
from app.models.device import Device
from app.modules.backup_service import run_backup_for_device

logger = logging.getLogger(__name__)

router = APIRouter(tags=["diagnostics"])


def _get_cutoff_date(time_filter: str) -> datetime:
    now = datetime.now(timezone.utc)
    if time_filter == "24h":
        return now - timedelta(days=1)
    elif time_filter == "30d":
        return now - timedelta(days=30)
    else:  # default 7d
        return now - timedelta(days=7)


@router.get("/diagnostics")
async def dashboard(
    request: Request,
    time_filter: str = Query("7d", pattern="^(24h|7d|30d)$"),
    status: str = Query("unresolved", pattern="^(unresolved|all)$"),
    sort_by: str = Query("timestamp"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """Diagnostic Dashboard Overview"""
    cutoff = _get_cutoff_date(time_filter)

    base_query = db.query(BackupFailure).join(Device, BackupFailure.device_id == Device.id).filter(
        BackupFailure.timestamp >= cutoff
    )

    if status == "unresolved":
        base_query = base_query.filter(BackupFailure.resolved == False)

    total_failures = base_query.count()

    # Devices with failures
    device_count = (
        db.query(func.count(func.distinct(BackupFailure.device_id)))
        .filter(BackupFailure.timestamp >= cutoff)
    )
    if status == "unresolved":
        device_count = device_count.filter(BackupFailure.resolved == False)
    devices_with_failures = device_count.scalar() or 0

    # Error distribution
    error_type_counts = (
        db.query(BackupFailure.error_type, func.count(BackupFailure.id))
        .filter(BackupFailure.timestamp >= cutoff)
    )
    if status == "unresolved":
        error_type_counts = error_type_counts.filter(BackupFailure.resolved == False)
    error_distribution_raw = error_type_counts.group_by(BackupFailure.error_type).all()

    error_distribution = {err_type: count for err_type, count in error_distribution_raw}

    # Most common error
    most_common_error = None
    most_common_error_pct = 0
    if error_distribution and total_failures > 0:
        sorted_errors = sorted(error_distribution.items(), key=lambda x: x[1], reverse=True)
        top_err, top_count = sorted_errors[0]
        most_common_error = top_err
        most_common_error_pct = round((top_count / total_failures) * 100, 1)

    # Auto-fix stats
    auto_fix_query = db.query(BackupFailure).filter(
        BackupFailure.timestamp >= cutoff,
        BackupFailure.auto_fix_attempted == True,
    )
    total_auto_fixes = auto_fix_query.count()
    resolved_auto_fixes = auto_fix_query.filter(BackupFailure.resolved == True).count()
    auto_fix_success_rate = (
        round((resolved_auto_fixes / total_auto_fixes) * 100, 1) if total_auto_fixes > 0 else 0
    )

    # Sorting
    order_func = desc if sort_order == "desc" else asc
    if sort_by == "hostname":
        sort_column = Device.hostname
    elif sort_by == "ip":
        sort_column = Device.ip_address
    elif sort_by == "error_type":
        sort_column = BackupFailure.error_type
    elif sort_by == "retry_count":
        sort_column = BackupFailure.retry_count
    elif sort_by == "status":
        sort_column = BackupFailure.resolved
    else:
        sort_column = BackupFailure.timestamp

    query = base_query.order_by(order_func(sort_column))

    total_pages = max(1, (total_failures + page_size - 1) // page_size)
    offset = (page - 1) * page_size
    failures = query.offset(offset).limit(page_size).all()

    # Pre-parse root cause if needed
    for f in failures:
        f.parsed_analysis = None
        if f.root_cause_analysis:
            try:
                f.parsed_analysis = json.loads(f.root_cause_analysis)
            except Exception:
                pass

    context = {
        "time_filter": time_filter,
        "status": status,
        "sort_by": sort_by,
        "sort_order": sort_order,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "total_failures": total_failures,
        "devices_with_failures": devices_with_failures,
        "most_common_error": most_common_error,
        "most_common_error_pct": most_common_error_pct,
        "auto_fix_success_rate": auto_fix_success_rate,
        "error_distribution": error_distribution,
        "failures": failures,
    }

    if request.headers.get("HX-Request") and request.headers.get("HX-Target") == "failures-table-container":
        return request.app.state.templates.TemplateResponse(
            request, "diagnostics/dashboard.html", context
        )

    return request.app.state.templates.TemplateResponse(
        request, "diagnostics/dashboard.html", context
    )


@router.get("/diagnostics/device/{device_id}")
async def device_failures(
    device_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Device-specific failure history and root cause diagnosis."""
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    last_successful_backup = (
        db.query(Backup)
        .filter(Backup.device_id == device_id, Backup.status == BackupStatus.success)
        .order_by(Backup.timestamp.desc())
        .first()
    )

    failures = (
        db.query(BackupFailure)
        .filter(BackupFailure.device_id == device_id)
        .order_by(BackupFailure.timestamp.desc())
        .all()
    )

    latest_failure = failures[0] if failures else None

    # Parse diagnostic info from latest failure
    analysis = None
    solution_steps = []
    if latest_failure and latest_failure.root_cause_analysis:
        try:
            analysis = json.loads(latest_failure.root_cause_analysis)
            solution_steps = analysis.get("solution_steps", [])
        except Exception:
            pass

    # Group failures by backup_id or timestamp into timeline attempts
    timeline = []
    attempts_by_backup: dict[Any, list[BackupFailure]] = {}
    for f in failures:
        key = f.backup_id or f.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        attempts_by_backup.setdefault(key, []).append(f)

    for key, items in attempts_by_backup.items():
        primary_item = items[0]
        backup_record = db.get(Backup, primary_item.backup_id) if primary_item.backup_id else None
        timeline.append({
            "backup_id": primary_item.backup_id,
            "timestamp": primary_item.timestamp,
            "status": "resolved" if all(item.resolved for item in items) else "failed",
            "backup_status": backup_record.status.value if backup_record else "failed",
            "attempts": items,
        })

    # Auto-fix history
    auto_fix_history = [
        f for f in failures if f.auto_fix_attempted
    ]
    for af in auto_fix_history:
        af.parsed_auto_fix = None
        if af.auto_fix_result:
            try:
                af.parsed_auto_fix = json.loads(af.auto_fix_result)
            except Exception:
                pass

    context = {
        "device": device,
        "last_successful_backup": last_successful_backup,
        "latest_failure": latest_failure,
        "analysis": analysis,
        "solution_steps": solution_steps,
        "timeline": timeline,
        "auto_fix_history": auto_fix_history,
        "failures_count": len(failures),
        "unresolved_count": sum(1 for f in failures if not f.resolved),
    }

    return request.app.state.templates.TemplateResponse(
        request, "diagnostics/failure_detail.html", context
    )


@router.post("/diagnostics/device/{device_id}/retry")
async def retry_device_backup(
    device_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Manually trigger backup retry for this device."""
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    try:
        backup = await run_backup_for_device(db, device)
        if backup.status == BackupStatus.success:
            # Mark unresolved failures for this device as resolved
            db.query(BackupFailure).filter(
                BackupFailure.device_id == device_id,
                BackupFailure.resolved == False,
            ).update(
                {"resolved": True, "resolved_at": datetime.now(timezone.utc)},
                synchronize_session=False,
            )
            db.commit()

        if request.headers.get("HX-Request") or "application/json" in request.headers.get("Accept", ""):
            return JSONResponse({
                "status": "success" if backup.status == BackupStatus.success else "failed",
                "message": f"Backup completed with status: {backup.status.value}",
                "backup_id": backup.id,
                "error_message": backup.error_message,
            })

        return RedirectResponse(
            url=f"/diagnostics/device/{device_id}?msg=Backup+{backup.status.value}",
            status_code=303,
        )

    except Exception as e:
        logger.error(f"Manual retry backup failed for {device.hostname}: {e}")
        if request.headers.get("HX-Request") or "application/json" in request.headers.get("Accept", ""):
            return JSONResponse({
                "status": "error",
                "message": str(e),
            }, status_code=500)
        return RedirectResponse(
            url=f"/diagnostics/device/{device_id}?error={str(e)}",
            status_code=303,
        )


@router.post("/diagnostics/failure/{failure_id}/resolve")
async def mark_resolved(
    failure_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark a backup failure as resolved."""
    failure = db.get(BackupFailure, failure_id)
    if not failure:
        raise HTTPException(status_code=404, detail="Backup failure record not found")

    failure.resolved = True
    failure.resolved_at = datetime.now(timezone.utc)
    db.commit()

    if request.headers.get("HX-Request") or "application/json" in request.headers.get("Accept", ""):
        return JSONResponse({
            "status": "success",
            "message": "Failure marked as resolved",
            "failure_id": failure.id,
            "resolved": True,
            "resolved_at": failure.resolved_at.isoformat(),
        })

    referer = request.headers.get("referer", "/diagnostics")
    return RedirectResponse(url=referer, status_code=303)


@router.get("/api/v1/diagnostics/stats")
async def get_diagnostic_stats(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """API endpoint for diagnostic charts and metrics."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    total_failures = (
        db.query(func.count(BackupFailure.id))
        .filter(BackupFailure.timestamp >= cutoff)
        .scalar()
        or 0
    )

    unresolved_count = (
        db.query(func.count(BackupFailure.id))
        .filter(BackupFailure.timestamp >= cutoff, BackupFailure.resolved == False)
        .scalar()
        or 0
    )

    devices_affected = (
        db.query(func.count(func.distinct(BackupFailure.device_id)))
        .filter(BackupFailure.timestamp >= cutoff)
        .scalar()
        or 0
    )

    # Error distribution
    error_dist = (
        db.query(BackupFailure.error_type, func.count(BackupFailure.id))
        .filter(BackupFailure.timestamp >= cutoff)
        .group_by(BackupFailure.error_type)
        .all()
    )

    # Severity distribution
    failures = (
        db.query(BackupFailure.root_cause_analysis)
        .filter(BackupFailure.timestamp >= cutoff)
        .all()
    )
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for (analysis_str,) in failures:
        if analysis_str:
            try:
                rep = json.loads(analysis_str)
                sev = rep.get("severity", "medium").lower()
                if sev in severity_counts:
                    severity_counts[sev] += 1
            except Exception:
                pass

    # Auto fix stats
    total_autofix = (
        db.query(func.count(BackupFailure.id))
        .filter(BackupFailure.timestamp >= cutoff, BackupFailure.auto_fix_attempted == True)
        .scalar()
        or 0
    )
    resolved_autofix = (
        db.query(func.count(BackupFailure.id))
        .filter(
            BackupFailure.timestamp >= cutoff,
            BackupFailure.auto_fix_attempted == True,
            BackupFailure.resolved == True,
        )
        .scalar()
        or 0
    )

    return {
        "period_days": days,
        "total_failures": total_failures,
        "unresolved_count": unresolved_count,
        "devices_affected": devices_affected,
        "error_distribution": {err: count for err, count in error_dist},
        "severity_distribution": severity_counts,
        "auto_fix_stats": {
            "attempted": total_autofix,
            "resolved": resolved_autofix,
            "success_rate": round((resolved_autofix / total_autofix) * 100, 1) if total_autofix > 0 else 0,
        },
    }
