from app.security import get_current_user, require_operator_or_admin
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.database import get_db
from app.modules.audit_service import AuditService
from app.models.user import User, UserRole
from app.models.location import Location
from app.models.device import Device
from app.schemas.location import LocationCreate, LocationRead, LocationUpdate
from app.modules import location_service
from app.modules.backup_service import run_backup_for_device

router = APIRouter(prefix="/locations", tags=["locations"])
logger = logging.getLogger(__name__)


def _location_metadata(location):
    if location is None:
        return None
    return {field: getattr(location, field) for field in (
        "name", "enabled", "group_id", "telegram_destination_id", "device_count")}


@router.get("/", response_model=list[LocationRead], dependencies=[Depends(get_current_user)])
async def list_locations(
    enabled_only: bool = Query(False, description="Filter active locations only"),
    search: Optional[str] = Query(None, description="Search by name"),
    db: Session = Depends(get_db)
):
    """
    List all locations
    """
    query = db.query(Location)
    
    if enabled_only:
        query = query.filter(Location.enabled == True)
    
    if search:
        query = query.filter(Location.name.ilike(f"%{search}%"))
    
    locations = query.order_by(Location.name).all()
    
    # Enrich with nested data
    result = []
    for loc in locations:
        loc_dict = LocationRead.from_orm(loc).model_dump()
        if loc.telegram_destination:
            loc_dict["telegram_channel_name"] = loc.telegram_destination.name
        if loc.group:
            loc_dict["group_name"] = loc.group.name
        result.append(LocationRead(**loc_dict))
    
    return result


@router.post("/", response_model=LocationRead, status_code=201)
async def create_location(request: Request, 
    location: LocationCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """
    Create new location with auto-setup:
    - Creates Telegram destination
    - Creates group with multi-destination (Local + Main + Location channel)
    - Links everything together
    """
    name = location.name
    try:
        new_location = await location_service.create_location(db, location)
        AuditService.log(db, action="CREATE", resource_type="locations", user=actor, request=request,
                         resource_id=new_location.id, resource_name=new_location.name, new_value=_location_metadata(new_location))
        
        # Enrich response
        result = LocationRead.from_orm(new_location).model_dump()
        if new_location.telegram_destination:
            result["telegram_channel_name"] = new_location.telegram_destination.name
        if new_location.group:
            result["group_name"] = new_location.group.name
        
        return LocationRead(**result)
    
    except ValueError as e:
        db.rollback()
        AuditService.log(db, action="CREATE", resource_type="locations", user=actor, request=request,
                         resource_name=name, status="failed")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        AuditService.log(db, action="CREATE", resource_type="locations", user=actor, request=request,
                         resource_name=name, status="failed")
        logger.error(f"Error creating location: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{location_id}", response_model=LocationRead, dependencies=[Depends(get_current_user)])
async def get_location(
    location_id: int,
    db: Session = Depends(get_db)
):
    """Get single location with full details"""
    location = db.query(Location).filter(Location.id == location_id).first()
    
    if not location:
        raise HTTPException(status_code=404, detail=f"Location dengan ID {location_id} tidak ditemukan")
    
    # Enrich response
    result = LocationRead.from_orm(location).model_dump()
    if location.telegram_destination:
        result["telegram_channel_name"] = location.telegram_destination.name
    if location.group:
        result["group_name"] = location.group.name
    
    # Update device count (real-time)
    result["device_count"] = location_service.get_location_device_count(db, location_id)
    
    return LocationRead(**result)


@router.put("/{location_id}", response_model=LocationRead)
async def update_location(request: Request, 
    location_id: int,
    update_data: LocationUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Update location fields"""
    existing = db.get(Location, location_id)
    old_value = _location_metadata(existing)
    name = existing.name if existing else None
    try:
        updated = await location_service.update_location(db, location_id, update_data)
        AuditService.log(db, action="UPDATE", resource_type="locations", user=actor, request=request,
                         resource_id=updated.id, resource_name=updated.name, old_value=old_value, new_value=_location_metadata(updated))
        
        # Enrich response
        result = LocationRead.from_orm(updated).model_dump()
        if updated.telegram_destination:
            result["telegram_channel_name"] = updated.telegram_destination.name
        if updated.group:
            result["group_name"] = updated.group.name
        
        return LocationRead(**result)
    
    except ValueError as e:
        db.rollback()
        AuditService.log(db, action="UPDATE", resource_type="locations", user=actor, request=request,
                         resource_id=location_id, resource_name=name, status="failed")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        AuditService.log(db, action="UPDATE", resource_type="locations", user=actor, request=request,
                         resource_id=location_id, resource_name=name, status="failed")
        logger.error(f"Error updating location: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/{location_id}", status_code=204)
async def delete_location(request: Request, 
    location_id: int,
    cascade: bool = Query(False, description="Hard delete if true, soft delete if false"),
    current_user: User = Depends(require_operator_or_admin),
    db: Session = Depends(get_db)
):
    """
    Delete location (soft delete by default)
    - cascade=False: Disable location (soft delete)
    - cascade=True: Delete location, group, destination, and reassign devices
    """
    if cascade and current_user.role != UserRole.admin:
        raise HTTPException(403, "Only administrators can delete a location and its destination")
    existing = db.get(Location, location_id)
    old_value = _location_metadata(existing)
    name = existing.name if existing else None
    try:
        await location_service.delete_location(db, location_id, cascade)
        AuditService.log(db, action="DELETE", resource_type="locations", user=current_user, request=request,
                         resource_id=location_id, resource_name=name, old_value=old_value,
                         new_value={"cascade": cascade})
        return None
    
    except ValueError as e:
        db.rollback()
        AuditService.log(db, action="DELETE", resource_type="locations", user=current_user, request=request,
                         resource_id=location_id, resource_name=name, status="failed")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        db.rollback()
        AuditService.log(db, action="DELETE", resource_type="locations", user=current_user, request=request,
                         resource_id=location_id, resource_name=name, status="failed")
        logger.error(f"Error deleting location: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{location_id}/test-backup")
async def test_location_backup(request: Request, 
    location_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """
    Test backup for one device in this location
    Returns backup status and destination info
    """
    # Get location
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location or not location.group:
        raise HTTPException(status_code=404, detail="Location atau group tidak ditemukan")
    
    # Get one enabled device from this group
    device = db.query(Device).filter(
        Device.group == location.group.name,
        Device.enabled == True
    ).first()
    
    if not device:
        raise HTTPException(
            status_code=404, 
            detail=f"Tidak ada device aktif di location '{location.name}'. Silakan assign device terlebih dahulu."
        )
    
    name = location.name
    # Run backup
    try:
        backup = await run_backup_for_device(db, device)
        AuditService.log(db, action="TEST_BACKUP", resource_type="locations", user=actor, request=request,
                         resource_id=location_id, resource_name=name, new_value={"device_id": device.id},
                         status="failed" if backup.status.value == "failed" else "success")
        
        return {
            "location_id": location_id,
            "location_name": location.name,
            "device_id": device.id,
            "device_hostname": device.hostname,
            "backup_id": backup.id,
            "status": backup.status.value,
            "destinations": backup.destination_type,
            "message": f"Backup {backup.status.value} untuk device {device.hostname}"
        }
    
    except Exception as e:
        db.rollback()
        AuditService.log(db, action="TEST_BACKUP", resource_type="locations", user=actor, request=request,
                         resource_id=location_id, resource_name=name, status="failed")
        logger.error(f"Test backup failed for location {location_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Backup gagal: {str(e)}")


@router.get("/{location_id}/devices", dependencies=[Depends(get_current_user)])
async def list_location_devices(
    location_id: int,
    db: Session = Depends(get_db)
):
    """Get all devices in this location"""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location or not location.group:
        raise HTTPException(status_code=404, detail="Location tidak ditemukan")
    
    devices = db.query(Device).filter(
        Device.group == location.group.name
    ).all()
    
    return {
        "location_id": location_id,
        "location_name": location.name,
        "group_name": location.group.name,
        "device_count": len(devices),
        "devices": [
            {
                "id": d.id,
                "hostname": d.hostname,
                "ip_address": d.ip_address,
                "device_type": d.device_type,
                "enabled": d.enabled
            }
            for d in devices
        ]
    }


@router.post("/{location_id}/devices")
async def assign_devices_to_location(request: Request, 
    location_id: int,
    device_ids: list[int],
    db: Session = Depends(get_db),
    actor: User = Depends(require_operator_or_admin),
):
    """Bulk assign devices to this location's group"""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location or not location.group:
        raise HTTPException(status_code=404, detail="Location tidak ditemukan")
    
    devices = db.query(Device).filter(Device.id.in_(device_ids)).all()
    
    if not devices:
        raise HTTPException(status_code=404, detail="Device tidak ditemukan")
    
    # Assign to group
    for device in devices:
        device.group = location.group.name
        device.location_id = location.id
    
    db.commit()
    
    # Update device count
    location.device_count = location_service.get_location_device_count(db, location_id)
    db.commit()
    AuditService.log(db, action="ADD_DEVICES", resource_type="locations", user=actor, request=request,
                     resource_id=location.id, resource_name=location.name, new_value={"device_ids": [device.id for device in devices], "device_count": len(devices)})

    
    return {
        "message": f"{len(devices)} device berhasil di-assign ke location '{location.name}'",
        "location_id": location_id,
        "group_name": location.group.name,
        "assigned_devices": [d.hostname for d in devices]
    }
