#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.credential import Credential
from app.models.device import Device
from app.models.group import Group
from app.models.job import Schedule
from app.models.location import Location
from app.models.destination import Destination

def verify_test_data():
    db: Session = SessionLocal()
    
    try:
        print("=" * 60)
        print("🔍 HK-NOVA TEST DATA VERIFICATION")
        print("=" * 60)
        
        credentials = db.query(Credential).all()
        devices = db.query(Device).all()
        groups = db.query(Group).all()
        schedules = db.query(Schedule).all()
        locations = db.query(Location).all()
        destinations = db.query(Destination).all()
        
        print(f"\n📊 TOTAL DATA:")
        print(f"   - Credentials: {len(credentials)}")
        print(f"   - Devices: {len(devices)}")
        print(f"   - Groups: {len(groups)}")
        print(f"   - Schedules: {len(schedules)}")
        print(f"   - Locations: {len(locations)}")
        print(f"   - Destinations: {len(destinations)}")
        
        print(f"\n🔑 CREDENTIALS:")
        for cred in credentials:
            print(f"   {cred.id}. {cred.name:20s} (user: {cred.username or 'N/A':15s}, group: {cred.group or 'default'})")
        
        print(f"\n🖥️  DEVICES BY TYPE:")
        mikrotik_devices = [d for d in devices if d.device_type == "mikrotik_routeros"]
        cisco_devices = [d for d in devices if d.device_type == "cisco_ios"]
        
        print(f"\n   🔵 Mikrotik RouterOS ({len(mikrotik_devices)}):")
        for dev in mikrotik_devices:
            status = "✅" if dev.enabled else "❌"
            critical = "🔴" if dev.is_critical else "  "
            proxy = "🔗" if dev.proxy_host else "  "
            monitor = f"⏱️ {dev.monitoring_interval}s" if dev.monitoring_interval else ""
            print(f"      {status} {critical} {proxy} {dev.hostname:25s} {dev.ip_address:15s} [{dev.group}] {monitor}")
        
        print(f"\n   🔴 Cisco IOS ({len(cisco_devices)}):")
        for dev in cisco_devices:
            status = "✅" if dev.enabled else "❌"
            critical = "🔴" if dev.is_critical else "  "
            proxy = "🔗" if dev.proxy_host else "  "
            monitor = f"⏱️ {dev.monitoring_interval}s" if dev.monitoring_interval else ""
            print(f"      {status} {critical} {proxy} {dev.hostname:25s} {dev.ip_address:15s} [{dev.group}] {monitor}")
        
        print(f"\n📊 DEVICE STATISTICS:")
        enabled_count = sum(1 for d in devices if d.enabled)
        disabled_count = sum(1 for d in devices if not d.enabled)
        critical_count = sum(1 for d in devices if d.is_critical)
        with_proxy = sum(1 for d in devices if d.proxy_host)
        with_monitoring = sum(1 for d in devices if d.monitoring_interval)
        with_override = sum(1 for d in devices if d.destination_ids_override)
        
        print(f"   - Enabled: {enabled_count}")
        print(f"   - Disabled: {disabled_count}")
        print(f"   - Critical: {critical_count}")
        print(f"   - With Proxy: {with_proxy}")
        print(f"   - With Monitoring Interval: {with_monitoring}")
        print(f"   - With Destination Override: {with_override}")
        
        print(f"\n🏢 GROUPS:")
        for group in groups:
            dest_ids = group.destination_ids or []
            print(f"   - {group.name:20s}: {group.description or 'N/A':30s} (destinations: {dest_ids})")
        
        print(f"\n⏰ SCHEDULES:")
        for sched in schedules:
            status = "✅" if sched.enabled else "❌"
            print(f"   {status} {sched.name:30s} | {sched.cron_expression:15s} | group: {sched.device_group or 'all'}")
        
        print(f"\n📍 LOCATIONS:")
        for loc in locations:
            status = "✅" if loc.enabled else "❌"
            print(f"   {status} {loc.name:20s}: {loc.description or 'N/A'}")
        
        print(f"\n💾 DESTINATIONS:")
        for dest in destinations:
            status = "✅" if dest.enabled else "❌"
            print(f"   {status} {dest.id}. {dest.name:20s} ({dest.dest_type.value})")
        
        print(f"\n{'=' * 60}")
        print(f"✅ VERIFICATION COMPLETE!")
        print(f"{'=' * 60}")
        
        print(f"\n🎯 TESTING CHECKLIST:")
        print(f"   [ ] Manual backup single device")
        print(f"   [ ] Manual backup multiple devices")
        print(f"   [ ] Manual backup by group")
        print(f"   [ ] Scheduled backup (check 3 schedules)")
        print(f"   [ ] Backup via proxy/jump host")
        print(f"   [ ] Backup with destination override")
        print(f"   [ ] Critical device monitoring")
        print(f"   [ ] Enable/disable device")
        print(f"   [ ] Group management")
        print(f"   [ ] Location tracking")
        print(f"   [ ] View backup history")
        print(f"   [ ] Restore configuration")
        print(f"   [ ] Notification testing")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    verify_test_data()
