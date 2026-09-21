import hashlib
import logging
from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.backup import Backup, BackupStatus
from app.modules.engines import get_engine

logger = logging.getLogger(__name__)


async def check_device_config(
    db: Session,
    device: Device,
    max_retries: int = 3,
) -> tuple[bool, str | None, str | None]:
    """
    Lightweight config check for monitoring.
    
    Returns: (changed, new_hash, error_message)
    - changed: True if config hash differs from last backup
    - new_hash: SHA256 hash of current config (or None if error)
    - error_message: Error details if check failed
    """
    if not device.enabled:
        return False, None, "Device disabled"
    
    credential = device.credential
    if not credential:
        return False, None, "No credential assigned"
    
    # Get backup engine
    engine = get_engine(device.backup_engine)
    
    # Retry logic
    last_error = None
    for attempt in range(max_retries):
        try:
            # Fetch config (text only, no binary for monitoring)
            config_text = await engine.fetch_config(device, credential)
            
            # Compute hash
            new_hash = hashlib.sha256(config_text.encode()).hexdigest()
            
            # Compare with latest backup
            latest_backup = db.query(Backup)\
                .filter(Backup.device_id == device.id)\
                .filter(Backup.status == BackupStatus.success)\
                .order_by(Backup.timestamp.desc())\
                .first()
            
            if not latest_backup or not latest_backup.config_hash:
                # No baseline yet
                return False, new_hash, None
            
            changed = (latest_backup.config_hash != new_hash)
            
            if changed:
                logger.warning(
                    "Config drift detected for %s: %s... -> %s...",
                    device.hostname,
                    latest_backup.config_hash[:12],
                    new_hash[:12]
                )
            
            return changed, new_hash, None
            
        except Exception as e:
            last_error = str(e)
            logger.warning(
                "Config check attempt %d/%d failed for %s: %s",
                attempt + 1, max_retries, device.hostname, e
            )
            if attempt < max_retries - 1:
                # Wait before retry (exponential backoff: 2s, 4s, 8s)
                import asyncio
                await asyncio.sleep(2 ** attempt)
    
    # All retries failed
    logger.error("Config check failed for %s after %d retries: %s",
                device.hostname, max_retries, last_error)
    return False, None, last_error


async def run_monitoring_job(db: Session, device_ids: list[int]) -> None:
    """
    Run config monitoring for a list of devices.
    Triggers full backup + notification if change detected.
    """
    logger.info("Running monitoring job for %d devices", len(device_ids))
    
    for device_id in device_ids:
        device = db.get(Device, device_id)
        if not device:
            logger.warning("Device %d not found, skipping", device_id)
            continue
        
        changed, new_hash, error = await check_device_config(db, device)
        
        if error:
            # Check failed after retries, skip
            continue
        
        if changed:
            # Config changed! Trigger full backup to capture the change
            logger.info("Triggering backup for %s due to config change", device.hostname)
            
            try:
                from app.modules.backup_service import run_backup_for_device
                backup = await run_backup_for_device(db, device, job_run=None)
                
                # Notification will be sent automatically by backup_service
                # (via send_config_change_notifications)
                
                logger.info("Monitoring-triggered backup complete for %s: %s",
                           device.hostname, backup.status.value)
            except Exception as e:
                logger.error("Failed to run monitoring backup for %s: %s",
                            device.hostname, e)
