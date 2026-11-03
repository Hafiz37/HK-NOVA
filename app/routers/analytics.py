from app.security import get_current_user
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_db
from app.models.device import Device
from app.models.backup import Backup, BackupStatus
from app.models.job import JobRun, JobStatus
from app.models.group import Group

router = APIRouter()


def resolve_range(days, start_date=None, end_date=None):
    try:
        if start_date or end_date:
            if not start_date or not end_date:
                raise ValueError()
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        else:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            end = today if days == 1 else today + timedelta(days=1)
            start = end - timedelta(days=days)
        if not 1 <= (end - start).days <= 365:
            raise ValueError()
        return start, end
    except ValueError:
        raise HTTPException(status_code=400, detail="Use YYYY-MM-DD with an ordered range of 1–365 days")


@router.get("/api/v1/analytics/backup-trend", dependencies=[Depends(get_current_user)])
async def get_backup_trend(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Return daily success/failed backup counts for last N days or custom date range
    """
    start, end = resolve_range(days, start_date, end_date)
    # Query backups grouped by date
    daily_stats = []
    current_date = start

    while current_date < end:
        next_date = current_date + timedelta(days=1)

        success_count = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= current_date,
                Backup.timestamp < next_date
            )
        ).scalar() or 0

        failed_count = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.status == BackupStatus.failed,
                Backup.timestamp >= current_date,
                Backup.timestamp < next_date
            )
        ).scalar() or 0

        daily_stats.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "success": success_count,
            "failed": failed_count
        })

        current_date = next_date

    actual_days = (end - start).days
    return {
        "data": daily_stats,
        "period": f"{actual_days} days"
    }


@router.get("/api/v1/analytics/device-status", dependencies=[Depends(get_current_user)])
async def get_device_status(db: Session = Depends(get_db)):
    """
    Return device online/offline/error distribution
    """
    total_devices = db.query(func.count(Device.id)).scalar()
    enabled_devices = db.query(func.count(Device.id)).filter(Device.enabled == True).scalar()
    disabled_devices = total_devices - enabled_devices

    # Get devices with recent failed backups (last 24h)
    twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)

    devices_with_errors = db.query(func.count(func.distinct(Backup.device_id))).filter(
        and_(
            Backup.status == BackupStatus.failed,
            Backup.timestamp >= twenty_four_hours_ago
        )
    ).scalar() or 0

    return {
        "total": total_devices,
        "enabled": enabled_devices,
        "disabled": disabled_devices,
        "errors": devices_with_errors,
        "healthy": enabled_devices - devices_with_errors
    }


@router.get("/api/v1/analytics/group-performance", dependencies=[Depends(get_current_user)])
async def get_group_performance(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Return success rate by group for heatmap
    """
    start, end = resolve_range(days, start_date, end_date)
    groups = db.query(Group).all()
    all_devices = db.query(Device).all()

    performance_data = []

    for group in groups:
        group_devices = [d for d in all_devices if d.group == group.name]
        device_ids = [d.id for d in group_devices]

        if not device_ids:
            continue

        total_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_rate = round((success_backups / total_backups * 100), 1) if total_backups > 0 else 0

        performance_data.append({
            "group": group.name,
            "device_count": len(group_devices),
            "total_backups": total_backups,
            "success_backups": success_backups,
            "success_rate": success_rate
        })

    # Sort by success rate descending
    performance_data.sort(key=lambda x: x["success_rate"], reverse=True)

    return {
        "data": performance_data,
        "period": f"{(end - start).days} days"
    }


@router.get("/api/v1/analytics/storage-usage", dependencies=[Depends(get_current_user)])
async def get_storage_usage(db: Session = Depends(get_db)):
    """
    Return storage usage per destination (estimated from backup file sizes)
    """
    from app.models.destination import Destination

    destinations = db.query(Destination).filter(Destination.enabled == True).all()

    storage_data = []

    for dest in destinations:
        total_size = 0
        backup_count = 0

        all_backups = db.query(Backup).filter(
            Backup.destination_path.isnot(None)
        ).all()

        for backup in all_backups:
            if backup.destination_path and dest.name.lower() in backup.destination_path.lower():
                if backup.file_size:
                    total_size += backup.file_size
                backup_count += 1

        storage_data.append({
            "destination": dest.name,
            "type": dest.dest_type.value,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "backup_count": backup_count
        })

    storage_data.sort(key=lambda x: x["total_size_bytes"], reverse=True)

    return {"data": storage_data}


@router.get("/api/v1/analytics/recent-activity", dependencies=[Depends(get_current_user)])
async def get_recent_activity(
    limit: int = Query(default=20, ge=5, le=100),
    db: Session = Depends(get_db)
):
    """
    Return recent backup and job activity for timeline view
    """
    # Get recent backups
    recent_backups = db.query(Backup).order_by(Backup.timestamp.desc()).limit(limit).all()

    # Get recent job runs
    recent_jobs = db.query(JobRun).order_by(JobRun.started_at.desc()).limit(limit).all()

    # Combine and sort by time
    activity = []

    for backup in recent_backups:
        device = db.query(Device).filter(Device.id == backup.device_id).first()
        activity.append({
            "type": "backup",
            "timestamp": backup.timestamp.isoformat(),
            "status": backup.status.value,
            "device_name": device.hostname if device else "Unknown",
            "device_id": backup.device_id,
            "backup_id": backup.id
        })

    for job in recent_jobs:
        activity.append({
            "type": "job",
            "timestamp": job.started_at.isoformat(),
            "status": job.status.value,
            "job_name": job.job_name,
            "devices_total": job.devices_total,
            "devices_success": job.devices_success,
            "job_id": job.id
        })

    # Sort by timestamp descending
    activity.sort(key=lambda x: x["timestamp"], reverse=True)

    return {"data": activity[:limit]}


@router.get("/api/v1/analytics/reliability-score", dependencies=[Depends(get_current_user)])
async def get_reliability_score(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Calculate overall backup reliability score and per-device breakdown
    """
    start, end = resolve_range(days, start_date, end_date)
    # Overall score
    total_backups = db.query(func.count(Backup.id)).filter(
        Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
    ).scalar() or 0

    success_backups = db.query(func.count(Backup.id)).filter(
        and_(
            Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
            Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
        )
    ).scalar() or 0

    overall_score = round((success_backups / total_backups * 100), 2) if total_backups > 0 else 0

    # Per-device scores
    devices = db.query(Device).filter(Device.enabled == True).all()
    device_scores = []

    for device in devices:
        device_total = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        device_success = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        device_score = round((device_success / device_total * 100), 1) if device_total > 0 else 0

        device_scores.append({
            "device_id": device.id,
            "hostname": device.hostname,
            "device_type": device.device_type,
            "group": device.group,
            "score": device_score,
            "total_backups": device_total,
            "success_backups": device_success
        })

    # Sort by score
    device_scores.sort(key=lambda x: x["score"], reverse=True)

    # Top performers (>95%)
    top_performers = [d for d in device_scores if d["score"] >= 95]

    # Problematic devices (<80%)
    problematic = [d for d in device_scores if d["score"] < 80 and d["total_backups"] > 0]

    return {
        "overall_score": overall_score,
        "total_backups": total_backups,
        "success_backups": success_backups,
        "period": f"{(end - start).days} days",
        "device_scores": device_scores,
        "top_performers": [d for d in device_scores if d["total_backups"] > 0][:15],
        "problematic_devices": problematic
    }


@router.get("/api/v1/analytics/device-type-distribution", dependencies=[Depends(get_current_user)])
async def get_device_type_distribution(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Return success rate distribution by device type
    """
    start, end = resolve_range(days, start_date, end_date)
    devices = db.query(Device).filter(Device.enabled == True).all()

    device_type_stats = {}

    for device in devices:
        device_type = device.device_type or "Unknown"

        if device_type not in device_type_stats:
            device_type_stats[device_type] = {
                "total_backups": 0,
                "success_backups": 0,
                "device_count": 0
            }

        device_type_stats[device_type]["device_count"] += 1

        total_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        device_type_stats[device_type]["total_backups"] += total_backups
        device_type_stats[device_type]["success_backups"] += success_backups

    result = []
    for device_type, stats in device_type_stats.items():
        success_rate = round(
            (stats["success_backups"] / stats["total_backups"] * 100), 1
        ) if stats["total_backups"] > 0 else 0

        result.append({
            "device_type": device_type,
            "device_count": stats["device_count"],
            "total_backups": stats["total_backups"],
            "success_backups": stats["success_backups"],
            "success_rate": success_rate
        })

    result.sort(key=lambda x: x["success_rate"], reverse=True)

    return {
        "data": result,
        "period": f"{(end - start).days} days"
    }


@router.get("/api/v1/analytics/backup-frequency-by-group", dependencies=[Depends(get_current_user)])
async def get_backup_frequency_by_group(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Return backup frequency (count) by group
    """
    start, end = resolve_range(days, start_date, end_date)
    groups = db.query(Group).all()
    all_devices = db.query(Device).all()

    frequency_data = []

    for group in groups:
        group_devices = [d for d in all_devices if d.group == group.name]
        device_ids = [d.id for d in group_devices]

        if not device_ids:
            continue

        total_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        failed_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.status == BackupStatus.failed,
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        frequency_data.append({
            "group": group.name,
            "device_count": len(group_devices),
            "total_backups": total_backups,
            "success_backups": success_backups,
            "failed_backups": failed_backups,
            "avg_per_device": round(total_backups / len(group_devices), 1) if group_devices else 0
        })

    unassigned_devices = [d for d in all_devices if not d.group or d.group == ""]
    if unassigned_devices:
        unassigned_ids = [d.id for d in unassigned_devices]

        total_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(unassigned_ids),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(unassigned_ids),
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        failed_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(unassigned_ids),
                Backup.status == BackupStatus.failed,
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        frequency_data.append({
            "group": "Unassigned",
            "device_count": len(unassigned_devices),
            "total_backups": total_backups,
            "success_backups": success_backups,
            "failed_backups": failed_backups,
            "avg_per_device": round(total_backups / len(unassigned_devices), 1)
        })

    frequency_data.sort(key=lambda x: x["total_backups"], reverse=True)

    return {
        "data": frequency_data,
        "period": f"{(end - start).days} days"
    }


@router.get("/api/v1/analytics/export-csv", dependencies=[Depends(get_current_user)])
async def export_analytics_csv(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Export analytics data as CSV
    """
    from fastapi.responses import StreamingResponse
    import io
    import csv

    start, end = resolve_range(days, start_date, end_date)
    devices = db.query(Device).filter(Device.enabled == True).all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Hostname", "Device Type", "Group", "IP Address",
        "Total Backups", "Successful Backups", "Failed Backups",
        "Success Rate (%)", "Last Backup"
    ])

    for device in devices:
        total_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        failed_backups = db.query(func.count(Backup.id)).filter(Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress, Backup.status == BackupStatus.failed, Backup.device_id == device.id).scalar() or 0

        success_rate = round((success_backups / total_backups * 100), 1) if total_backups > 0 else 0

        last_backup = db.query(Backup).filter(
            Backup.device_id == device.id, Backup.timestamp >= start, Backup.timestamp < end
        ).order_by(Backup.timestamp.desc()).first()

        last_backup_time = last_backup.timestamp.strftime("%Y-%m-%d %H:%M:%S") if last_backup else "Never"

        writer.writerow([
            device.hostname,
            device.device_type or "Unknown",
            device.group or "Unassigned",
            device.ip_address,
            total_backups,
            success_backups,
            failed_backups,
            success_rate,
            last_backup_time
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=hk-nova-analytics-{datetime.utcnow().strftime('%Y%m%d')}.csv"
        }
    )


@router.get("/api/v1/analytics/export-json", dependencies=[Depends(get_current_user)])
async def export_analytics_json(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Export all analytics data as JSON
    """
    from fastapi.responses import StreamingResponse
    import json
    import io

    start, end = resolve_range(days, start_date, end_date)
    reliability = await get_reliability_score(days, start_date, end_date, db)
    device_types = await get_device_type_distribution(days, start_date, end_date, db)
    backup_freq = await get_backup_frequency_by_group(days, start_date, end_date, db)
    trend = await get_backup_trend(days, start_date, end_date, db)

    export_data = {
        "generated_at": datetime.utcnow().isoformat(),
        "period_days": (end - start).days,
        "reliability_score": reliability,
        "device_type_distribution": device_types,
        "backup_frequency_by_group": backup_freq,
        "backup_trend": trend
    }

    output = io.BytesIO()
    output.write(json.dumps(export_data, indent=2, default=str).encode())
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=hk-nova-analytics-{datetime.utcnow().strftime('%Y%m%d')}.json"
        }
    )


@router.get("/api/v1/analytics/export-excel", dependencies=[Depends(get_current_user)])
async def export_analytics_excel(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Export analytics data as Excel with multiple sheets
    """
    from fastapi.responses import StreamingResponse
    import io
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.chart import BarChart, Reference
    except ImportError:
        return {"error": "openpyxl not installed. Run: pip install openpyxl"}

    start, end = resolve_range(days, start_date, end_date)
    wb = Workbook()

    ws_summary = wb.active
    ws_summary.title = "Summary"

    total_backups = db.query(func.count(Backup.id)).filter(
        Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
    ).scalar() or 0

    success_backups = db.query(func.count(Backup.id)).filter(
        and_(
            Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
            Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
        )
    ).scalar() or 0

    overall_score = round((success_backups / total_backups * 100), 2) if total_backups > 0 else 0

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    ws_summary['A1'] = 'HK-NOVA Analytics Report'
    ws_summary['A1'].font = Font(size=16, bold=True)
    ws_summary['A2'] = f'Period: {start:%Y-%m-%d} to {end - timedelta(days=1):%Y-%m-%d}'
    ws_summary['A3'] = f'Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}'

    ws_summary['A5'] = 'Metric'
    ws_summary['B5'] = 'Value'
    ws_summary['A5'].fill = header_fill
    ws_summary['A5'].font = header_font
    ws_summary['B5'].fill = header_fill
    ws_summary['B5'].font = header_font

    ws_summary['A6'] = 'Overall Reliability Score'
    ws_summary['B6'] = f'{overall_score}%'
    ws_summary['A7'] = 'Total Backups'
    ws_summary['B7'] = total_backups
    ws_summary['A8'] = 'Successful Backups'
    ws_summary['B8'] = success_backups
    ws_summary['A9'] = 'Failed Backups'
    ws_summary['B9'] = total_backups - success_backups

    ws_devices = wb.create_sheet("By Device")
    ws_devices['A1'] = 'Hostname'
    ws_devices['B1'] = 'Device Type'
    ws_devices['C1'] = 'Group'
    ws_devices['D1'] = 'Total Backups'
    ws_devices['E1'] = 'Success'
    ws_devices['F1'] = 'Failed'
    ws_devices['G1'] = 'Success Rate %'

    for col in ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1']:
        ws_devices[col].fill = header_fill
        ws_devices[col].font = header_font

    devices = db.query(Device).filter(Device.enabled == True).all()
    row = 2

    for device in devices:
        total = db.query(func.count(Backup.id)).filter(
            and_(Backup.device_id == device.id, Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress)
        ).scalar() or 0

        success = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        success_rate = round((success / total * 100), 1) if total > 0 else 0

        ws_devices[f'A{row}'] = device.hostname
        ws_devices[f'B{row}'] = device.device_type or "Unknown"
        ws_devices[f'C{row}'] = device.group or "Unassigned"
        ws_devices[f'D{row}'] = total
        ws_devices[f'E{row}'] = success
        ws_devices[f'F{row}'] = total - success
        ws_devices[f'G{row}'] = success_rate
        row += 1

    ws_devices.column_dimensions['A'].width = 20
    ws_devices.column_dimensions['B'].width = 15
    ws_devices.column_dimensions['C'].width = 15

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=hk-nova-analytics-{datetime.utcnow().strftime('%Y%m%d')}.xlsx"
        }
    )


@router.get("/api/v1/analytics/performance-metrics", dependencies=[Depends(get_current_user)])
async def get_performance_metrics(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Get performance metrics: avg duration, size, peak hours, fastest device
    """
    from collections import Counter

    start, end = resolve_range(days, start_date, end_date)
    backups = db.query(Backup).filter(
        and_(
            Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress,
            Backup.status.in_([BackupStatus.success, BackupStatus.unchanged])
        )
    ).all()

    if not backups:
        return {
            "avg_duration": "N/A",
            "duration_detail": "No data",
            "avg_size": "N/A",
            "size_detail": "No data",
            "peak_hour": "N/A",
            "peak_hour_detail": "No data",
            "fastest_device": "N/A",
            "fastest_device_detail": "No data"
        }

    total_size = sum(b.file_size for b in backups if b.file_size)
    count_with_size = len([b for b in backups if b.file_size])
    avg_size_bytes = total_size / count_with_size if count_with_size > 0 else 0
    avg_size_mb = avg_size_bytes / (1024 * 1024)

    hours = Counter()
    for backup in backups:
        hour = backup.timestamp.hour
        hours[hour] += 1

    peak_hour_num, peak_count = hours.most_common(1)[0] if hours else (0, 0)
    peak_hour_str = f"{peak_hour_num:02d}:00"

    durations = {}
    for backup in backups:
        job = backup.job_run
        if job and job.completed_at and job.started_at and job.devices_total == 1:
            seconds = (job.completed_at - job.started_at).total_seconds()
            if seconds >= 0:
                durations.setdefault(backup.device_id, []).append(seconds)
    fastest_device_id = min(durations, key=lambda key: sum(durations[key]) / len(durations[key])) if durations else None
    fastest_device_name = "N/A"
    fastest_detail = "No single-device job timing available"
    if fastest_device_id:
        device = db.get(Device, fastest_device_id)
        fastest_device_name = device.hostname if device else "Unknown"
        fastest_detail = f"Avg {sum(durations[fastest_device_id]) / len(durations[fastest_device_id]):.1f}s (single-device jobs)"

    job_runs = db.query(JobRun).filter(
        and_(
            JobRun.started_at >= start, JobRun.started_at < end,
            JobRun.completed_at.isnot(None),
            JobRun.status == JobStatus.completed
        )
    ).all()

    if job_runs:
        total_duration = sum([
            (jr.completed_at - jr.started_at).total_seconds()
            for jr in job_runs
        ])
        avg_duration_seconds = total_duration / len(job_runs)

        if avg_duration_seconds < 60:
            avg_duration_str = f"{avg_duration_seconds:.0f}s"
        elif avg_duration_seconds < 3600:
            avg_duration_str = f"{avg_duration_seconds/60:.1f}m"
        else:
            avg_duration_str = f"{avg_duration_seconds/3600:.1f}h"

        duration_detail = f"Based on {len(job_runs)} job runs"
    else:
        avg_duration_str = "N/A"
        duration_detail = "No completed jobs"

    return {
        "avg_duration": avg_duration_str,
        "duration_detail": duration_detail,
        "avg_size": f"{avg_size_mb:.1f} MB",
        "size_detail": f"{count_with_size} backups analyzed",
        "peak_hour": peak_hour_str,
        "peak_hour_detail": f"{peak_count} backups at this hour",
        "fastest_device": fastest_device_name,
        "fastest_device_detail": fastest_detail
    }


@router.get("/api/v1/analytics/anomalies", dependencies=[Depends(get_current_user)])
async def detect_anomalies(
    days: int = Query(default=7, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Detect anomalies in backup patterns
    """
    anomalies = []

    now = datetime.utcnow()

    start, end = resolve_range(days, start_date, end_date)
    now = min(now, end)
    recent_24h = max(start, now - timedelta(hours=24))

    total_backups_period = db.query(func.count(Backup.id)).filter(
        Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
    ).scalar() or 0

    success_backups_period = db.query(func.count(Backup.id)).filter(
        and_(
            Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
            Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
        )
    ).scalar() or 0

    success_rate_period = (success_backups_period / total_backups_period * 100) if total_backups_period > 0 else 0

    total_backups_24h = db.query(func.count(Backup.id)).filter(
        Backup.timestamp >= recent_24h, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
    ).scalar() or 0

    success_backups_24h = db.query(func.count(Backup.id)).filter(
        and_(
            Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
            Backup.timestamp >= recent_24h, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
        )
    ).scalar() or 0

    success_rate_24h = (success_backups_24h / total_backups_24h * 100) if total_backups_24h > 0 else 0

    if success_rate_24h < success_rate_period - 20 and total_backups_24h > 5:
        anomalies.append({
            "type": "success_rate_drop",
            "severity": "high",
            "icon": "arrow-down-circle",
            "title": "Sudden Success Rate Drop",
            "description": f"Success rate dropped from {success_rate_period:.1f}% to {success_rate_24h:.1f}% in the last 24 hours"
        })

    devices = db.query(Device).filter(Device.enabled == True).all()

    for device in devices:
        device_backups = db.query(Backup).filter(
            and_(
                Backup.device_id == device.id,
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).order_by(Backup.timestamp.desc()).limit(10).all()

        if len(device_backups) >= 2:
            latest_backup = device_backups[0]
            time_since_last = now - latest_backup.timestamp

            if len(device_backups) > 1:
                avg_interval = sum([
                    (device_backups[i].timestamp - device_backups[i+1].timestamp).total_seconds()
                    for i in range(len(device_backups)-1)
                ]) / (len(device_backups)-1)

                if time_since_last.total_seconds() > avg_interval * 2 and avg_interval > 3600:
                    anomalies.append({
                        "type": "missing_backup",
                        "severity": "medium",
                        "icon": "clock-history",
                        "title": f"Missing Backup: {device.hostname}",
                        "description": f"No backup for {int(time_since_last.total_seconds()/3600)}h (expected every {int(avg_interval/3600)}h)"
                    })

        recent_fails = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status == BackupStatus.failed,
                Backup.timestamp >= recent_24h, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        if recent_fails >= 3:
            anomalies.append({
                "type": "repeated_failures",
                "severity": "high",
                "icon": "x-circle",
                "title": f"Repeated Failures: {device.hostname}",
                "description": f"{recent_fails} failures in the selected 24-hour window"
            })

    return {
        "anomalies": anomalies[:10],
        "total_found": len(anomalies),
        "period": f"{(end - start).days} days"
    }


@router.get("/api/v1/analytics/backup-heatmap", dependencies=[Depends(get_current_user)])
async def get_backup_heatmap(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Return backup count heatmap by day of week and hour
    """
    start, end = resolve_range(days, start_date, end_date)
    backups = db.query(Backup).filter(
        Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
    ).all()

    heatmap_data = {}
    days_of_week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    for day in days_of_week:
        heatmap_data[day] = [0] * 24

    for backup in backups:
        day_of_week = backup.timestamp.weekday()
        day_name = days_of_week[(day_of_week + 1) % 7]
        hour = backup.timestamp.hour
        heatmap_data[day_name][hour] += 1

    series_data = []
    for day in days_of_week:
        series_data.append({
            "name": day,
            "data": heatmap_data[day]
        })

    return {
        "data": series_data,
        "hours": [f"{h:02d}:00" for h in range(24)],
        "period": f"{(end - start).days} days"
    }


@router.get("/api/v1/analytics/export-pdf", dependencies=[Depends(get_current_user)])
async def export_analytics_pdf(
    days: int = Query(default=30, ge=1, le=365),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Export analytics data as PDF report
    """
    from fastapi.responses import StreamingResponse
    import io

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        return {"error": "reportlab not installed. Run: pip install reportlab"}

    start, end = resolve_range(days, start_date, end_date)
    period_text = f"{start:%Y-%m-%d} to {end - timedelta(days=1):%Y-%m-%d}"
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)
    elements = []

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=30,
        alignment=TA_CENTER
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=12,
        spaceBefore=12
    )

    subheading_style = ParagraphStyle(
        'CustomSubHeading',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.HexColor('#374151'),
        spaceAfter=8,
        spaceBefore=8
    )

    elements.append(Paragraph("HK-NOVA Analytics Report", title_style))
    elements.append(Paragraph(f"Period: {period_text}", styles['Normal']))
    elements.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}", styles['Normal']))
    elements.append(Spacer(1, 0.3*inch))

    total_backups = db.query(func.count(Backup.id)).filter(
        Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
    ).scalar() or 0

    success_backups = db.query(func.count(Backup.id)).filter(
        and_(
            Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
            Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
        )
    ).scalar() or 0

    failed_backups = db.query(func.count(Backup.id)).filter(Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress, Backup.status == BackupStatus.failed).scalar() or 0
    overall_score = round((success_backups / total_backups * 100), 2) if total_backups > 0 else 0

    total_devices = db.query(func.count(Device.id)).filter(Device.enabled == True).scalar() or 0

    elements.append(Paragraph("Executive Summary", heading_style))

    summary_data = [
        ['Metric', 'Value'],
        ['Overall Reliability Score', f'{overall_score}%'],
        ['Total Devices', str(total_devices)],
        ['Total Backups', str(total_backups)],
        ['Successful Backups', str(success_backups)],
        ['Failed Backups', str(failed_backups)],
    ]

    summary_table = Table(summary_data, colWidths=[3.5*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
    ]))

    elements.append(summary_table)
    elements.append(Spacer(1, 0.4*inch))

    elements.append(Paragraph("Top Performing Devices", heading_style))

    devices = db.query(Device).filter(Device.enabled == True).all()
    device_scores = []

    for device in devices:
        device_total = db.query(func.count(Backup.id)).filter(
            and_(Backup.device_id == device.id, Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress)
        ).scalar() or 0

        device_success = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status.in_([BackupStatus.success, BackupStatus.unchanged]),
                Backup.timestamp >= start, Backup.timestamp < end, Backup.status != BackupStatus.in_progress
            )
        ).scalar() or 0

        if device_total > 0:
            success_rate = round((device_success / device_total * 100), 1)
            device_scores.append({
                'hostname': device.hostname,
                'device_type': device.device_type or "Unknown",
                'group': device.group or "N/A",
                'total': device_total,
                'success': device_success,
                'rate': success_rate
            })

    device_scores.sort(key=lambda x: x['rate'], reverse=True)

    top_performers = device_scores[:15]

    device_data = [['Hostname', 'Type', 'Group', 'Total', 'Success', 'Failed', 'Rate %']]

    for dev in top_performers:
        device_data.append([
            dev['hostname'][:25],
            dev['device_type'][:15],
            dev['group'][:15],
            str(dev['total']),
            str(dev['success']),
            str(dev['total'] - dev['success']),
            f"{dev['rate']}%"
        ])

    if len(device_data) > 1:
        device_table = Table(device_data, repeatRows=1, colWidths=[1.8*inch, 1*inch, 1*inch, 0.6*inch, 0.6*inch, 0.6*inch, 0.7*inch])
        device_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ]))
        elements.append(device_table)
    else:
        elements.append(Paragraph("No device data available", styles['Normal']))

    elements.append(Spacer(1, 0.3*inch))

    problematic = [d for d in device_scores if d['rate'] < 80 and d['total'] > 0]

    if problematic:
        elements.append(Paragraph("Problematic Devices (Success Rate < 80%)", heading_style))

        prob_data = [['Hostname', 'Type', 'Group', 'Total', 'Success', 'Failed', 'Rate %']]

        for dev in problematic[:15]:
            prob_data.append([
                dev['hostname'][:25],
                dev['device_type'][:15],
                dev['group'][:15],
                str(dev['total']),
                str(dev['success']),
                str(dev['total'] - dev['success']),
                f"{dev['rate']}%"
            ])

        prob_table = Table(prob_data, repeatRows=1, colWidths=[1.8*inch, 1*inch, 1*inch, 0.6*inch, 0.6*inch, 0.6*inch, 0.7*inch])
        prob_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ef4444')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ]))
        elements.append(prob_table)
        elements.append(Spacer(1, 0.2*inch))

    if len(devices) > 15:
        elements.append(Paragraph(f"<i>Note: Report shows top 15 performers. Total devices: {len(devices)}</i>", styles['Normal']))

    doc.build(elements)

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=hk-nova-analytics-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        }
    )
