from fastapi import APIRouter, Depends, Query
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


@router.get("/api/v1/analytics/backup-trend")
async def get_backup_trend(
    days: int = Query(default=30, ge=7, le=90),
    db: Session = Depends(get_db)
):
    """
    Return daily success/failed backup counts for last N days
    """
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Query backups grouped by date
    daily_stats = []
    current_date = start_date
    
    while current_date <= end_date:
        next_date = current_date + timedelta(days=1)
        
        success_count = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.status == BackupStatus.success,
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
    
    return {
        "data": daily_stats,
        "period": f"{days} days"
    }


@router.get("/api/v1/analytics/device-status")
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


@router.get("/api/v1/analytics/group-performance")
async def get_group_performance(
    days: int = Query(default=30, ge=7, le=90),
    db: Session = Depends(get_db)
):
    """
    Return success rate by group for heatmap
    """
    groups = db.query(Group).all()
    all_devices = db.query(Device).all()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    performance_data = []
    
    for group in groups:
        group_devices = [d for d in all_devices if d.group == group.name]
        device_ids = [d.id for d in group_devices]
        
        if not device_ids:
            continue
        
        total_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.timestamp >= start_date
            )
        ).scalar() or 0
        
        success_backups = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id.in_(device_ids),
                Backup.status == BackupStatus.success,
                Backup.timestamp >= start_date
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
        "period": f"{days} days"
    }


@router.get("/api/v1/analytics/storage-usage")
async def get_storage_usage(db: Session = Depends(get_db)):
    """
    Return storage usage per destination (estimated from backup file sizes)
    """
    from app.models.destination import Destination
    
    destinations = db.query(Destination).filter(Destination.enabled == True).all()
    
    storage_data = []
    
    for dest in destinations:
        # Sum of all backup sizes for this destination
        # Note: This is approximate as destination_type field stores multiple destinations
        total_size = db.query(func.sum(Backup.file_size)).filter(
            Backup.destination_type.like(f"%{dest.dest_type.value}%")
        ).scalar() or 0
        
        backup_count = db.query(func.count(Backup.id)).filter(
            Backup.destination_type.like(f"%{dest.dest_type.value}%")
        ).scalar() or 0
        
        storage_data.append({
            "destination": dest.name,
            "type": dest.dest_type.value,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "backup_count": backup_count
        })
    
    return {"data": storage_data}


@router.get("/api/v1/analytics/recent-activity")
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


@router.get("/api/v1/analytics/reliability-score")
async def get_reliability_score(
    days: int = Query(default=30, ge=7, le=90),
    db: Session = Depends(get_db)
):
    """
    Calculate overall backup reliability score and per-device breakdown
    """
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Overall score
    total_backups = db.query(func.count(Backup.id)).filter(
        Backup.timestamp >= start_date
    ).scalar() or 0
    
    success_backups = db.query(func.count(Backup.id)).filter(
        and_(
            Backup.status == BackupStatus.success,
            Backup.timestamp >= start_date
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
                Backup.timestamp >= start_date
            )
        ).scalar() or 0
        
        device_success = db.query(func.count(Backup.id)).filter(
            and_(
                Backup.device_id == device.id,
                Backup.status == BackupStatus.success,
                Backup.timestamp >= start_date
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
        "period": f"{days} days",
        "device_scores": device_scores,
        "top_performers": top_performers[:10],
        "problematic_devices": problematic[:10]
    }
