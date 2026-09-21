import hashlib
import json
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.backup import Backup, BackupStatus
from app.models.destination import Destination
from app.models.job import JobRun, JobStatus
from app.modules.engines import get_engine
from app.modules.destinations import get_destination

logger = logging.getLogger(__name__)


def _resolve_group_profile(db: Session, device: Device):
    """
    Resolve destination_ids dengan priority:
    1. device.destination_ids_override (highest)
    2. group.destination_ids
    3. None (fallback)
    
    Returns: (destination_ids, engine_override)
    """
    from app.models.group import Group
    
    if device.destination_ids_override:
        logger.info(
            f"Device {device.hostname}: Using custom destinations {device.destination_ids_override}"
        )
        return device.destination_ids_override, device.backup_engine
    
    if device.group:
        group = db.query(Group).filter(Group.name == device.group).first()
        if group and group.destination_ids:
            logger.info(
                f"Device {device.hostname}: Using group '{group.name}' destinations {group.destination_ids}"
            )
            return group.destination_ids, group.backup_engine
    
    logger.info(f"Device {device.hostname}: No destinations configured, will use fallback")
    return None, None


async def run_backup_for_device(
    db: Session,
    device: Device,
    destination_ids: list[int] | None = None,
    engine_override: str | None = None,
    job_run: JobRun | None = None,
) -> Backup:
    """Run a single backup for one device. Returns the Backup record."""
    # Resolve group profile defaults (explicit params take priority)
    group_dest_ids, group_engine = _resolve_group_profile(db, device)
    if destination_ids is None and group_dest_ids:
        destination_ids = group_dest_ids
    engine_name = engine_override or group_engine or device.backup_engine
    engine = get_engine(engine_name)

    credential = device.credential
    if not credential:
        backup = Backup(
            device_id=device.id,
            status=BackupStatus.failed,
            error_message="No credential assigned to device",
            job_run_id=job_run.id if job_run else None,
        )
        db.add(backup)
        db.commit()
        return backup

    backup = Backup(
        device_id=device.id,
        status=BackupStatus.in_progress,
        job_run_id=job_run.id if job_run else None,
    )
    db.add(backup)
    db.commit()

    # ── Try binary fetch first (e.g. Proxmox ZIP) ────────────────────
    try:
        binary_result = await engine.fetch_binary(device, credential)
    except Exception as e:
        backup.status = BackupStatus.failed
        backup.error_message = str(e)
        db.commit()
        logger.error("Binary backup failed for %s: %s", device.hostname, e)
        return backup

    if binary_result is not None:
        return await _handle_binary_backup(
            db, device, backup, binary_result, destination_ids, job_run
        )

    # ── Text config fetch (all other engines) ────────────────────────
    try:
        config_text = await engine.fetch_config(device, credential)
    except Exception as e:
        backup.status = BackupStatus.failed
        backup.error_message = str(e)
        db.commit()
        logger.error("Backup failed for %s: %s", device.hostname, e)
        return backup

    return await _handle_text_backup(
        db, device, backup, config_text, destination_ids
    )


def _resolve_destinations(db: Session, destination_ids: list[int] | None) -> list[Destination]:
    """Enabled Destination rows for the given IDs."""
    destinations: list[Destination] = []
    if destination_ids:
        destinations = db.query(Destination).filter(
            Destination.id.in_(destination_ids),
            Destination.enabled == True,
        ).all()
    return destinations


def _summarize_results(results: list[tuple[str, str]]) -> tuple[str, str | None]:
    """Pick a comma-joined label and a primary path for a successful multi-dest save."""
    if not results:
        return "unknown", None
    types = sorted({t for t, _ in results})
    local_paths = [p for t, p in results if t == "local"]
    primary = local_paths[0] if local_paths else results[0][1]
    return ", ".join(types), primary


async def _save_to_local_fallback(
    db: Session,
    device: Device,
    backup: Backup,
    config_text: str
) -> bool:
    """
    Emergency fallback: Save backup to Local Storage when all destinations fail.
    
    Returns:
        True if fallback succeeded, False if even fallback failed
    """
    logger.warning(
        f"SMART FALLBACK triggered for {device.hostname}: "
        f"All configured destinations failed, attempting emergency save to Local Storage"
    )
    
    local_dest = db.query(Destination).filter(
        Destination.dest_type == "local",
        Destination.enabled == True
    ).first()
    
    if not local_dest:
        logger.error(f"Smart fallback failed: No Local destination available")
        return False
    
    try:
        config_hash = hashlib.sha256(config_text.encode("utf-8")).hexdigest()
        device_metadata = {
            "hostname": device.hostname,
            "ip_address": device.ip_address,
            "device_type": device.device_type,
            "group": device.group or "default",
            "port": device.port,
            "notes": device.notes,
        }
        backup_metadata = {
            "hash": config_hash,
            "size": len(config_text.encode("utf-8")),
            "timestamp": backup.timestamp,
        }
        
        from app.modules.destinations import get_destination
        local_backend = get_destination("local")
        
        config_dict = local_dest.config_json or {}
        config_dict["_device_meta"] = device_metadata
        config_dict["_backup_meta"] = backup_metadata
        
        path = await local_backend.save(
            device.hostname,
            config_text,
            config_dict
        )
        
        logger.info(f"Smart fallback SUCCESS: Saved to {path}")
        
        backup.destination_type = "local (emergency fallback)"
        backup.destination_path = path
        backup.config_hash = config_hash
        backup.file_size = len(config_text.encode("utf-8"))
        backup.error_message = "Original destinations failed, saved to local fallback"
        
        return True
        
    except Exception as e:
        logger.error(f"Smart fallback FAILED: {e}")
        return False


async def _handle_binary_backup(
    db: Session,
    device: Device,
    backup: Backup,
    binary_result: tuple[bytes, str, list[str]],
    destination_ids: list[int] | None,
    job_run,
) -> Backup:
    """Save a binary (tar.gz/zip) backup to each selected destination and
    store a JSON manifest in the DB."""
    file_bytes, extension, file_list = binary_result
    archive_type = "tgz" if extension == ".tar.gz" else "zip"
    config_hash = hashlib.sha256(file_bytes).hexdigest()

    destinations = _resolve_destinations(db, destination_ids)

    device_metadata = {
        "hostname": device.hostname,
        "ip_address": device.ip_address,
        "device_type": device.device_type,
        "group": device.group or "default",
        "port": device.port,
        "proxy_host": device.proxy_host,
        "enabled": device.enabled,
        "notes": device.notes,
    }

    backup_metadata = {
        "hash": config_hash,
        "size": len(file_bytes),
        "timestamp": datetime.now(timezone.utc),
        "status": "success",
    }

    results: list[tuple[str, str]] = []
    save_errors: list[str] = []
    for dest in destinations:
        dest_type = dest.dest_type.value
        try:
            backend = get_destination(dest_type)
            config_with_meta = {
                **(dest.config_json or {}),
                "_device_meta": device_metadata,
                "_backup_meta": backup_metadata,
            }
            
            if dest_type == "telegram" and config_with_meta.get("bot_token"):
                try:
                    config_with_meta["bot_token"] = dest.decrypt_token(config_with_meta["bot_token"])
                except Exception:
                    pass
            
            path = await backend.save_binary(
                hostname=device.hostname,
                data=file_bytes,
                extension=extension,
                config=config_with_meta,
            )
            results.append((dest_type, path))
            logger.info(
                "Saved binary backup for %s to %s: %s",
                device.hostname, dest_type, path,
            )
        except NotImplementedError:
            logger.warning(
                "Destination '%s' does not support archive backups — skipping for %s",
                dest_type, device.hostname,
            )
        except Exception as e:
            logger.error(
                "Failed to save binary backup to %s for %s: %s",
                dest_type, device.hostname, e,
            )
            save_errors.append(f"{dest_type}: {e}")

    if not results:
        backup.config_hash = config_hash
        backup.file_size = len(file_bytes)
        backup.status = BackupStatus.failed
        backup.error_message = (
            "Binary backup could not be written to any destination"
            + (": " + "; ".join(save_errors) if save_errors else "")
        )
        db.commit()
        logger.error("Binary backup for %s failed — no destination accepted the archive", device.hostname)
        return backup

    dest_label, primary_path = _summarize_results(results)
    manifest = json.dumps({
        "type": archive_type,
        "path": primary_path,
        "files": sorted(file_list),
        "file_count": len(file_list),
    })

    backup.config_text = manifest
    backup.config_hash = config_hash
    backup.file_size = len(file_bytes)
    backup.destination_type = dest_label
    backup.destination_path = primary_path
    backup.status = BackupStatus.success
    db.commit()

    logger.info(
        "Binary backup complete for %s: %d files, %d bytes, hash=%s..., destinations=%s",
        device.hostname, len(file_list), len(file_bytes), config_hash[:12], dest_label,
    )
    return backup


async def _handle_text_backup(
    db: Session,
    device: Device,
    backup: Backup,
    config_text: str,
    destination_ids: list[int] | None,
) -> Backup:
    """Save text config to destinations with Smart Fallback on total failure"""
    
    config_hash = hashlib.sha256(config_text.encode()).hexdigest()
    
    previous_backup = db.query(Backup)\
        .filter(Backup.device_id == device.id)\
        .filter(Backup.status == BackupStatus.success)\
        .order_by(Backup.timestamp.desc())\
        .first()

    config_changed = False
    previous_hash = None
    if previous_backup and previous_backup.config_hash:
        if previous_backup.config_hash != config_hash:
            config_changed = True
            previous_hash = previous_backup.config_hash
            logger.info("Config changed for %s: %s... -> %s...", 
                       device.hostname, previous_hash[:12], config_hash[:12])
    
    destinations = _resolve_destinations(db, destination_ids)
    
    if not destinations:
        logger.warning(
            f"No destinations resolved for {device.hostname}, "
            f"will attempt local fallback if needed"
        )

    device_metadata = {
        "hostname": device.hostname,
        "ip_address": device.ip_address,
        "device_type": device.device_type,
        "group": device.group or "default",
        "port": device.port,
        "proxy_host": device.proxy_host,
        "enabled": device.enabled,
        "notes": device.notes,
    }

    backup_metadata = {
        "hash": config_hash,
        "size": len(config_text),
        "timestamp": datetime.now(timezone.utc),
        "status": "success",
    }

    results: list[tuple[str, str]] = []
    save_errors: list[str] = []
    
    for dest in destinations:
        dest_type = dest.dest_type.value
        try:
            backend = get_destination(dest_type)
            config_with_meta = {
                **(dest.config_json or {}),
                "_device_meta": device_metadata,
                "_backup_meta": backup_metadata,
            }
            
            if dest_type == "telegram" and config_with_meta.get("bot_token"):
                try:
                    config_with_meta["bot_token"] = dest.decrypt_token(config_with_meta["bot_token"])
                except Exception:
                    pass
            
            path = await backend.save(
                hostname=device.hostname,
                config_text=config_text,
                config=config_with_meta,
            )
            results.append((dest_type, path))
            logger.info(
                f"✅ Backup success: {device.hostname} → {dest.name} ({dest_type})"
            )
            
        except Exception as e:
            error_msg = str(e)
            save_errors.append(f"{dest.name}: {error_msg}")
            
            if dest_type == "telegram":
                if "429" in error_msg or "rate" in error_msg.lower():
                    logger.warning(
                        f"⚠️ TELEGRAM RATE LIMITED: {device.hostname} → {dest.name}\n"
                        f"   Error: {error_msg}\n"
                        f"   Recommendation: Wait before retry or reduce backup frequency"
                    )
                elif "connection" in error_msg.lower() or "timeout" in error_msg.lower():
                    logger.warning(
                        f"⚠️ TELEGRAM CONNECTION FAILED: {device.hostname} → {dest.name}\n"
                        f"   Error: {error_msg}\n"
                        f"   Recommendation: Check network connectivity or Telegram API status"
                    )
                else:
                    logger.error(
                        f"❌ Telegram error: {device.hostname} → {dest.name}: {error_msg}"
                    )
            else:
                logger.error(
                    f"❌ Backup failed: {device.hostname} → {dest.name}: {error_msg}"
                )
    
    if not results:
        logger.warning(
            f"⚠️ ALL DESTINATIONS FAILED for {device.hostname}\n"
            f"   Attempted: {len(destinations)} destination(s)\n"
            f"   Errors: {'; '.join(save_errors)}\n"
            f"   Triggering Smart Fallback to Local Storage..."
        )
        
        fallback_success = await _save_to_local_fallback(
            db, device, backup, config_text
        )
        
        if fallback_success:
            backup.status = BackupStatus.success
            backup.config_text = config_text
            backup.config_changed = config_changed
            db.commit()
            return backup
        else:
            backup.status = BackupStatus.failed
            backup.config_text = config_text
            backup.config_hash = config_hash
            backup.file_size = len(config_text)
            backup.error_message = (
                f"All destinations failed: {'; '.join(save_errors)}. "
                f"Emergency local fallback also failed."
            )
            db.commit()
            return backup
    
    dest_label, primary_path = _summarize_results(results)
    backup.config_text = config_text
    backup.config_hash = config_hash
    backup.file_size = len(config_text)
    backup.destination_type = dest_label
    backup.destination_path = primary_path
    backup.status = BackupStatus.success
    backup.config_changed = config_changed
    
    if save_errors:
        backup.error_message = f"Partial success. Failed: {'; '.join(save_errors)}"
    
    db.commit()

    logger.info(
        "Backup complete for %s: %d bytes, hash=%s..., destinations=%s",
        device.hostname, len(config_text), config_hash[:12], dest_label,
    )
    
    if config_changed and previous_hash:
        try:
            from app.modules.notifications import send_config_change_notifications
            await send_config_change_notifications(db, device, backup, previous_hash)
        except Exception as e:
            logger.error("Failed to send config change notification for %s: %s", 
                        device.hostname, e)
    
    return backup


async def run_backup_job(
    db: Session,
    job_name: str,
    device_ids: list[int],
    destination_ids: list[int] | None = None,
    engine_override: str | None = None,
    schedule_id: int | None = None,
) -> JobRun:
    """Run a backup job across multiple devices."""
    job_run = JobRun(
        job_name=job_name,
        schedule_id=schedule_id,
        status=JobStatus.running,
        devices_total=len(device_ids),
    )
    db.add(job_run)
    db.commit()

    errors = []
    for device_id in device_ids:
        device = db.get(Device, device_id)
        if not device or not device.enabled:
            job_run.devices_failed += 1
            errors.append(f"Device {device_id}: not found or disabled")
            continue

        try:
            backup = await run_backup_for_device(
                db, device,
                destination_ids=destination_ids,
                engine_override=engine_override,
                job_run=job_run,
            )
            if backup.status == BackupStatus.success:
                job_run.devices_success += 1
            else:
                job_run.devices_failed += 1
                errors.append(f"{device.hostname}: {backup.error_message}")
        except Exception as e:
            job_run.devices_failed += 1
            errors.append(f"{device.hostname}: {e}")

    job_run.completed_at = datetime.now(timezone.utc)
    job_run.status = JobStatus.completed if job_run.devices_failed == 0 else JobStatus.failed
    job_run.error_log = "\n".join(errors) if errors else None
    db.commit()

    logger.info(
        "Job '%s' complete: %d/%d success, %d failed",
        job_name, job_run.devices_success, job_run.devices_total, job_run.devices_failed,
    )

    # Run retention sweep after job
    try:
        from app.modules.retention.manager import run_retention_sweep
        await run_retention_sweep(db)
    except Exception as e:
        logger.error("Post-job retention sweep failed: %s", e)

    # Send notifications
    try:
        from app.modules.notifications import send_job_notifications
        await send_job_notifications(db, job_run)
    except Exception as e:
        logger.error("Failed to send job notifications: %s", e)

    return job_run
