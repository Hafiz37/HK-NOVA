#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.orm import Session
from app.database import engine, SessionLocal
from app.models.credential import Credential
from app.models.device import Device
from app.models.group import Group
from app.models.job import Schedule
from app.models.location import Location
from datetime import datetime, timezone

def seed_test_data():
    db: Session = SessionLocal()
    
    try:
        print("=" * 60)
        print("🚀 HK-NOVA TEST DATA SEEDER")
        print("=" * 60)
        
        existing_creds = db.query(Credential).count()
        existing_devices = db.query(Device).count()
        print(f"\n📊 Data existing:")
        print(f"   - Credentials: {existing_creds}")
        print(f"   - Devices: {existing_devices}")
        
        print(f"\n🔧 Membuat credential baru...")
        cred_mikrotik = Credential(
            name="mikrotik-test",
            username="admin",
            group="testing"
        )
        cred_mikrotik.set_password("testmikrotik123")
        cred_mikrotik.set_enable_secret("enable123")
        db.add(cred_mikrotik)
        db.flush()
        print(f"   ✅ Credential 'mikrotik-test' (ID: {cred_mikrotik.id})")
        
        cred_cisco = db.query(Credential).filter(Credential.name.like("%cisco%")).first()
        if not cred_cisco:
            cred_cisco = Credential(
                name="cisco-test",
                username="cisco",
                group="testing"
            )
            cred_cisco.set_password("cisco123")
            cred_cisco.set_enable_secret("enable123")
            db.add(cred_cisco)
            db.flush()
            print(f"   ✅ Credential 'cisco-test' (ID: {cred_cisco.id})")
        
        default_cred = db.query(Credential).first()
        
        print(f"\n🏢 Membuat groups...")
        groups_data = [
            {"name": "testing", "description": "Testing devices", "destination_ids": [1, 2]},
            {"name": "production", "description": "Production devices", "destination_ids": [1, 3, 5]},
            {"name": "branch-office", "description": "Branch office devices", "destination_ids": [2, 4]},
        ]
        
        for g_data in groups_data:
            existing_group = db.query(Group).filter(Group.name == g_data["name"]).first()
            if not existing_group:
                group = Group(**g_data)
                db.add(group)
                print(f"   ✅ Group '{g_data['name']}'")
        
        db.flush()
        
        print(f"\n📍 Membuat locations...")
        locations_data = [
            {"name": "Jakarta HQ", "description": "Jakarta Headquarters", "telegram_destination_id": 5, "enabled": True},
            {"name": "Surabaya Branch", "description": "Surabaya Branch Office", "telegram_destination_id": 5, "enabled": True},
        ]
        
        for loc_data in locations_data:
            existing_loc = db.query(Location).filter(Location.name == loc_data["name"]).first()
            if not existing_loc:
                location = Location(**loc_data)
                db.add(location)
                print(f"   ✅ Location '{loc_data['name']}'")
        
        db.flush()
        
        print(f"\n🖥️  Membuat 17 devices baru...")
        
        mikrotik_devices = [
            {"hostname": "mikrotik-core-01", "ip": "192.168.1.1", "is_critical": True, "monitoring_interval": 300, "group": "production", "notes": "Core router Jakarta HQ", "credential": cred_mikrotik},
            {"hostname": "mikrotik-core-02", "ip": "192.168.1.2", "is_critical": True, "group": "production", "notes": "Core router Jakarta HQ - Backup", "credential": cred_mikrotik, "proxy_host": "192.168.1.1", "proxy_port": 22},
            {"hostname": "mikrotik-branch-01", "ip": "10.10.1.1", "group": "branch-office", "notes": "Branch router Surabaya", "credential": cred_mikrotik},
            {"hostname": "mikrotik-branch-02", "ip": "10.10.1.2", "group": "branch-office", "notes": "Branch router Bandung", "credential": cred_mikrotik},
            {"hostname": "mikrotik-edge-01", "ip": "172.16.1.1", "group": "production", "notes": "Edge router DMZ", "credential": cred_mikrotik, "destination_ids_override": [1, 3]},
            {"hostname": "mikrotik-edge-02", "ip": "172.16.1.2", "enabled": False, "group": "production", "notes": "Edge router DMZ - Standby", "credential": cred_mikrotik},
            {"hostname": "mikrotik-wifi-01", "ip": "192.168.10.1", "monitoring_interval": 600, "group": "production", "notes": "WiFi controller Jakarta", "credential": cred_mikrotik},
            {"hostname": "mikrotik-wifi-02", "ip": "192.168.10.2", "group": "production", "notes": "WiFi controller Surabaya", "credential": cred_mikrotik, "proxy_host": "10.10.1.1", "proxy_port": 22},
            {"hostname": "mikrotik-lab-01", "ip": "192.168.99.1", "group": "testing", "notes": "Lab router for testing", "credential": cred_mikrotik},
            {"hostname": "mikrotik-lab-02", "ip": "192.168.99.2", "group": "testing", "notes": "Lab router for development", "credential": cred_mikrotik},
            {"hostname": "mikrotik-vpn-01", "ip": "10.20.1.1", "is_critical": True, "port": 2222, "group": "production", "notes": "VPN gateway primary", "credential": cred_mikrotik},
            {"hostname": "mikrotik-vpn-02", "ip": "10.20.1.2", "is_critical": True, "group": "production", "notes": "VPN gateway secondary", "credential": cred_mikrotik},
            {"hostname": "mikrotik-backup-01", "ip": "192.168.50.1", "monitoring_interval": 900, "group": "production", "notes": "Backup link router", "credential": cred_mikrotik},
            {"hostname": "mikrotik-backup-02", "ip": "192.168.50.2", "group": "production", "notes": "Backup link router 2", "credential": cred_mikrotik, "proxy_host": "192.168.1.1", "proxy_port": 22, "destination_ids_override": [1, 2, 5]},
            {"hostname": "mikrotik-test-disabled", "ip": "192.168.100.1", "enabled": False, "group": "testing", "notes": "Disabled for maintenance", "credential": cred_mikrotik},
        ]
        
        cisco_devices = [
            {"hostname": "cisco-core-sw01", "ip": "192.168.2.1", "device_type": "cisco_ios", "is_critical": True, "group": "production", "notes": "Core switch L3 Jakarta", "credential": cred_cisco},
            {"hostname": "cisco-core-sw02", "ip": "192.168.2.2", "device_type": "cisco_ios", "is_critical": True, "group": "production", "notes": "Core switch L3 Surabaya", "credential": cred_cisco},
            {"hostname": "cisco-dist-sw01", "ip": "192.168.3.1", "device_type": "cisco_ios", "monitoring_interval": 300, "group": "production", "notes": "Distribution switch", "credential": cred_cisco},
            {"hostname": "cisco-access-sw01", "ip": "192.168.4.1", "device_type": "cisco_ios", "port": 23, "group": "production", "notes": "Access switch via Telnet", "credential": cred_cisco},
            {"hostname": "cisco-test-disabled", "ip": "192.168.5.1", "device_type": "cisco_ios", "enabled": False, "group": "testing", "notes": "Test switch - disabled", "credential": cred_cisco},
        ]
        
        all_devices = mikrotik_devices + cisco_devices
        
        for idx, dev_data in enumerate(all_devices, 1):
            cred = dev_data.pop("credential", default_cred)
            
            proxy_cred_id = None
            if dev_data.get("proxy_host"):
                proxy_cred_id = cred.id if cred else None
            
            device = Device(
                hostname=dev_data.get("hostname"),
                ip_address=dev_data.get("ip"),
                device_type=dev_data.get("device_type", "mikrotik_routeros"),
                credential_id=cred.id if cred else None,
                group=dev_data.get("group", "default"),
                enabled=dev_data.get("enabled", True),
                backup_engine="netmiko",
                port=dev_data.get("port", 22),
                proxy_host=dev_data.get("proxy_host"),
                proxy_port=dev_data.get("proxy_port"),
                proxy_credential_id=proxy_cred_id,
                notes=dev_data.get("notes"),
                is_critical=dev_data.get("is_critical", False),
                monitoring_interval=dev_data.get("monitoring_interval"),
                destination_ids_override=dev_data.get("destination_ids_override"),
            )
            db.add(device)
            device_type_label = "🔵 Mikrotik" if "mikrotik" in device.hostname else "🔴 Cisco"
            critical = " [CRITICAL]" if device.is_critical else ""
            proxy = " [PROXY]" if device.proxy_host else ""
            disabled = " [DISABLED]" if not device.enabled else ""
            print(f"   {idx:2d}. {device_type_label} {device.hostname:25s} ({device.ip_address:15s}){critical}{proxy}{disabled}")
        
        db.flush()
        
        print(f"\n⏰ Membuat schedules...")
        schedules_data = [
            {
                "name": "Daily All Testing Devices",
                "cron_expression": "0 2 * * *",
                "device_group": "testing",
                "destination_ids": [1, 2],
                "enabled": True
            },
            {
                "name": "Hourly Critical Devices",
                "cron_expression": "0 * * * *",
                "device_group": "production",
                "destination_ids": [1, 3, 5],
                "enabled": True
            },
            {
                "name": "Weekly Full Backup",
                "cron_expression": "0 3 * * 0",
                "destination_ids": [1, 2, 3, 4, 5],
                "enabled": True
            },
        ]
        
        for sched_data in schedules_data:
            existing_sched = db.query(Schedule).filter(Schedule.name == sched_data["name"]).first()
            if not existing_sched:
                schedule = Schedule(**sched_data)
                db.add(schedule)
                print(f"   ✅ Schedule '{sched_data['name']}' ({sched_data['cron_expression']})")
        
        db.commit()
        
        print(f"\n{'=' * 60}")
        print(f"✅ DATA BERHASIL DI-INSERT!")
        print(f"{'=' * 60}")
        
        final_creds = db.query(Credential).count()
        final_devices = db.query(Device).count()
        final_groups = db.query(Group).count()
        final_schedules = db.query(Schedule).count()
        final_locations = db.query(Location).count()
        
        mikrotik_count = db.query(Device).filter(Device.device_type == "mikrotik_routeros").count()
        cisco_count = db.query(Device).filter(Device.device_type == "cisco_ios").count()
        critical_count = db.query(Device).filter(Device.is_critical == True).count()
        proxy_count = db.query(Device).filter(Device.proxy_host != None).count()
        monitoring_count = db.query(Device).filter(Device.monitoring_interval != None).count()
        
        print(f"\n📊 SUMMARY:")
        print(f"   - Total Credentials: {final_creds}")
        print(f"   - Total Devices: {final_devices}")
        print(f"     • Mikrotik: {mikrotik_count}")
        print(f"     • Cisco: {cisco_count}")
        print(f"     • Critical: {critical_count}")
        print(f"     • With Proxy: {proxy_count}")
        print(f"     • With Monitoring: {monitoring_count}")
        print(f"   - Total Groups: {final_groups}")
        print(f"   - Total Schedules: {final_schedules}")
        print(f"   - Total Locations: {final_locations}")
        
        print(f"\n🎯 FITUR YANG BISA DITEST:")
        print(f"   ✅ Manual backup (single/multiple/group)")
        print(f"   ✅ Scheduled backup (3 schedules)")
        print(f"   ✅ Proxy/Jump host (3 devices)")
        print(f"   ✅ Destination override (2 devices)")
        print(f"   ✅ Critical device monitoring (7 devices)")
        print(f"   ✅ Monitoring intervals (5 devices)")
        print(f"   ✅ Enable/disable devices (3 disabled)")
        print(f"   ✅ Group-based management (4 groups)")
        print(f"   ✅ Location tracking (2 locations)")
        print(f"   ✅ Multi-vendor support (Mikrotik + Cisco)")
        
        print(f"\n{'=' * 60}")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    seed_test_data()
