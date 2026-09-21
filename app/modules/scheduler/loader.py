import logging
from sqlalchemy.orm import Session
from app.models.device import Device
from app.modules.scheduler.manager import add_monitoring_job, remove_monitoring_job

logger = logging.getLogger(__name__)

DEFAULT_MONITORING_INTERVAL = 15  # minutes


async def load_monitoring_jobs(db: Session) -> None:
    """
    Load monitoring jobs for all critical devices.
    Groups devices by monitoring_interval to minimize scheduler overhead.
    """
    # Clear existing monitoring jobs first
    from app.modules.scheduler.manager import scheduler
    existing_jobs = [j.id for j in scheduler.get_jobs() if j.id.startswith("monitor_")]
    for job_id in existing_jobs:
        remove_monitoring_job(job_id)
    
    # Query critical devices
    critical_devices = db.query(Device).filter(
        Device.is_critical == True,
        Device.enabled == True,
    ).all()
    
    if not critical_devices:
        logger.info("No critical devices found, no monitoring jobs scheduled")
        return
    
    # Group by interval
    interval_groups: dict[int, list[int]] = {}
    for dev in critical_devices:
        interval = dev.monitoring_interval or DEFAULT_MONITORING_INTERVAL
        if interval not in interval_groups:
            interval_groups[interval] = []
        interval_groups[interval].append(dev.id)
    
    # Create scheduler jobs
    from app.modules.config_monitor import run_monitoring_job
    
    for interval, device_ids in interval_groups.items():
        job_id = f"monitor_{interval}min"
        add_monitoring_job(
            job_id=job_id,
            interval_minutes=interval,
            func=run_monitoring_job,
            db=db,
            device_ids=device_ids,
        )
        logger.info("Scheduled monitoring job '%s' for %d devices every %d minutes",
                   job_id, len(device_ids), interval)
    
    logger.info("Monitoring jobs loaded: %d intervals, %d total devices",
               len(interval_groups), len(critical_devices))
