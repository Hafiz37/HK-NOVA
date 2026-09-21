import logging
import re
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.location import Location
from app.models.destination import Destination
from app.models.group import Group
from app.models.device import Device
from app.schemas.location import LocationCreate, LocationUpdate

logger = logging.getLogger(__name__)


def sanitize_group_name(name: str) -> str:
    """
    Convert free-text location name to valid group name
    Examples:
      "Site Bali" → "site-bali"
      "Mitra Sukolilo" → "mitra-sukolilo"
      "Kantor Pusat - Jakarta" → "kantor-pusat-jakarta"
      "Partner ABC Corp." → "partner-abc-corp"
    """
    name = name.lower()
    name = re.sub(r'[^a-z0-9]+', '-', name)  # Replace non-alphanumeric with dash
    name = name.strip('-')  # Remove leading/trailing dashes
    name = re.sub(r'-+', '-', name)  # Collapse multiple dashes
    return name


def get_default_bot_token(db: Session) -> str:
    """Get bot token from any existing Telegram destination"""
    dest = db.query(Destination).filter(
        Destination.dest_type == "telegram",
        Destination.enabled == True
    ).first()
    
    if dest and dest.config_json:
        return dest.config_json.get("bot_token", "")
    
    return ""


def validate_telegram_chat_id(chat_id: str) -> bool:
    """Validate Telegram chat ID format (negative number for channels)"""
    pattern = r'^-\d{10,}$'
    return bool(re.match(pattern, chat_id))


def get_location_device_count(db: Session, location_id: int) -> int:
    """Real-time device count for location"""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location or not location.group:
        return 0
    
    count = db.query(Device).filter(
        Device.group == location.group.name,
        Device.enabled == True
    ).count()
    
    return count


async def create_location(db: Session, location_data: LocationCreate) -> Location:
    """
    Create location with auto-setup:
    1. Create Telegram destination for this location
    2. Create Group with destination_ids = [Local, Main, new_dest]
    3. Create Location record
    4. Return Location object
    """
    try:
        # Step 1: Get Main Channel destination
        main_channel = db.query(Destination).filter(
            Destination.dest_type == "telegram",
            Destination.enabled == True
        ).order_by(Destination.id).first()
        
        if not main_channel:
            raise ValueError("Main Channel belum dikonfigurasi. Silakan setup Telegram destination Main Channel terlebih dahulu.")
        
        logger.info(f"Using Main Channel: {main_channel.name} (ID: {main_channel.id})")
        
        # Step 2: Get or use Bot Token
        bot_token = location_data.telegram_bot_token or get_default_bot_token(db)
        
        if not bot_token:
            raise ValueError("Bot token tidak ditemukan. Silakan setup Telegram destination terlebih dahulu.")
        
        # Step 3: Create Telegram Destination for this location
        telegram_dest = Destination(
            name=f"Telegram - {location_data.name}",
            dest_type="telegram",
            enabled=True,
            config_json={
                "bot_token": bot_token,
                "chat_id": location_data.telegram_chat_id,
                "compress": False,
                "max_file_size_mb": 45
            }
        )
        db.add(telegram_dest)
        db.flush()  # Get ID
        
        logger.info(f"Created Telegram destination: {telegram_dest.name} (ID: {telegram_dest.id})")
        
        # Step 4: Get Local Destination
        local_dest = db.query(Destination).filter(
            Destination.dest_type == "local",
            Destination.enabled == True
        ).first()
        
        if not local_dest:
            raise ValueError("Local destination tidak ditemukan.")
        
        # Step 5: Build destination_ids array
        destination_ids = [local_dest.id, main_channel.id, telegram_dest.id]
        
        logger.info(f"Destination IDs for group: {destination_ids} (Local, Main, Location)")
        
        # Step 6: Generate sanitized group name
        group_name = sanitize_group_name(location_data.name)
        
        # Check if group name already exists
        existing_group = db.query(Group).filter(Group.name == group_name).first()
        if existing_group:
            # Append suffix to make it unique
            counter = 2
            original_name = group_name
            while existing_group:
                group_name = f"{original_name}-{counter}"
                existing_group = db.query(Group).filter(Group.name == group_name).first()
                counter += 1
        
        # Step 7: Create Group
        group = Group(
            name=group_name,
            description=f"Devices at {location_data.name}",
            destination_ids=destination_ids,
            backup_engine="netmiko"
        )
        db.add(group)
        db.flush()
        
        logger.info(f"Created group: {group.name} (ID: {group.id})")
        
        # Step 8: Create Location
        location = Location(
            name=location_data.name,
            description=location_data.description,
            notes=location_data.notes,
            enabled=location_data.enabled,
            telegram_destination_id=telegram_dest.id,
            group_id=group.id,
            device_count=0
        )
        db.add(location)
        db.flush()
        
        # Step 9: Update backreferences
        group.location_id = location.id
        
        db.commit()
        db.refresh(location)
        
        logger.info(f"✅ Location created successfully: {location.name} (ID: {location.id})")
        
        return location
        
    except IntegrityError as e:
        db.rollback()
        if "UNIQUE constraint failed: locations.name" in str(e):
            raise ValueError(f"Location dengan nama '{location_data.name}' sudah ada. Gunakan nama lain.")
        raise ValueError(f"Database error: {str(e)}")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create location: {e}")
        raise


async def update_location(db: Session, location_id: int, update_data: LocationUpdate) -> Location:
    """Update location and sync with group/destination if needed"""
    location = db.query(Location).filter(Location.id == location_id).first()
    
    if not location:
        raise ValueError(f"Location dengan ID {location_id} tidak ditemukan")
    
    try:
        # Update basic fields
        if update_data.name is not None:
            # Check uniqueness
            existing = db.query(Location).filter(
                Location.name == update_data.name,
                Location.id != location_id
            ).first()
            if existing:
                raise ValueError(f"Location dengan nama '{update_data.name}' sudah ada")
            
            old_name = location.name
            location.name = update_data.name
            
            # Update related group name and description
            if location.group:
                location.group.name = sanitize_group_name(update_data.name)
                location.group.description = f"Devices at {update_data.name}"
            
            # Update telegram destination name
            if location.telegram_destination:
                location.telegram_destination.name = f"Telegram - {update_data.name}"
            
            logger.info(f"Renamed location: {old_name} → {update_data.name}")
        
        if update_data.description is not None:
            location.description = update_data.description
        
        if update_data.notes is not None:
            location.notes = update_data.notes
        
        if update_data.enabled is not None:
            location.enabled = update_data.enabled
            # Sync with group and destination
            if location.group:
                location.group.enabled = update_data.enabled
            if location.telegram_destination:
                location.telegram_destination.enabled = update_data.enabled
        
        # Update telegram_chat_id if provided
        if update_data.telegram_chat_id is not None:
            if location.telegram_destination and location.telegram_destination.config_json:
                location.telegram_destination.config_json["chat_id"] = update_data.telegram_chat_id
                db.add(location.telegram_destination)
                logger.info(f"Updated Telegram chat ID for location: {location.name}")
        
        db.commit()
        db.refresh(location)
        
        logger.info(f"✅ Location updated: {location.name} (ID: {location.id})")
        
        return location
        
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database error: {str(e)}")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update location: {e}")
        raise


async def delete_location(db: Session, location_id: int, cascade: bool = False) -> None:
    """
    Delete location.
    If cascade=False (default): soft delete (enabled=False)
    If cascade=True: hard delete with device reassignment
    """
    location = db.query(Location).filter(Location.id == location_id).first()
    
    if not location:
        raise ValueError(f"Location dengan ID {location_id} tidak ditemukan")
    
    try:
        if not cascade:
            # Soft delete
            location.enabled = False
            
            if location.group:
                # Don't actually disable the group - just mark location as disabled
                # Devices can still backup, but won't show as active location
                pass
            
            if location.telegram_destination:
                location.telegram_destination.enabled = False
            
            db.commit()
            logger.info(f"✅ Location soft-deleted: {location.name} (ID: {location.id})")
        
        else:
            # Hard delete (cascade)
            # Reassign devices to 'default' group
            if location.group:
                devices = db.query(Device).filter(Device.group == location.group.name).all()
                for device in devices:
                    device.group = 'default'
                    device.location_id = None
                
                logger.info(f"Reassigned {len(devices)} devices to 'default' group")
                
                # Delete group
                db.delete(location.group)
            
            # Delete telegram destination
            if location.telegram_destination:
                db.delete(location.telegram_destination)
            
            # Delete location
            db.delete(location)
            
            db.commit()
            logger.info(f"✅ Location hard-deleted: {location.name} (ID: {location_id})")
    
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete location: {e}")
        raise
