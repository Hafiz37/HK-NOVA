# Location Management Guide

Comprehensive guide to organizing devices by physical location with automated setup workflows.

---

## Overview

Location Management (introduced in v1.0) provides physical site organization with automated infrastructure generation. When you create a location, HK-NOVA automatically provisions supporting components to streamline multi-site deployments:

- **Auto-generated Telegram destination** for location-specific backup notifications
- **Auto-generated device group** for policy inheritance
- **Automatic linking** between location, group, and destination

This automation reduces setup time from ~10 minutes per site to under 30 seconds.

---

## Concepts

### What is a Location?

A **Location** represents a physical site or logical grouping of devices:

**Physical Sites:**
- Branch offices (Tokyo Office, New York HQ, London Branch)
- Data centers (DC1-Primary, DC2-DR, Colo-West)
- Customer premises (ClientA-Main, ClientB-Backup)
- Network POPs (POP-Seattle, POP-Frankfurt)

**Logical Groups:**
- Departments (IT Infrastructure, Engineering Lab, Operations NOC)
- Service tiers (Production, Staging, Development)
- Security zones (DMZ, Internal, Management)
- Customer organizations (for MSPs)

### Auto-Setup Workflow

When you create a location, HK-NOVA executes a multi-step workflow:

**Step 1: Validate Prerequisites**
- Check if main Telegram bot token configured (optional)
- Verify location name unique
- Confirm no naming conflicts with existing groups

**Step 2: Create Telegram Destination** (if bot token configured)
- Name: `{location_name} - Telegram`
- Type: Telegram
- Bot token: Inherits from main configuration
- Chat ID: Location-specific channel (configure later)
- Compression: Inherits default settings
- Status: Created but inactive until chat ID configured

**Step 3: Create Device Group**
- Name: `{location_name}`
- Description: Auto-generated with location reference
- Destination IDs: Links to Telegram destination from step 2
- Notification channels: Inherits from location settings
- Status: Active immediately

**Step 4: Link Components**
- Location ↔ Group association (one-to-one)
- Group ↔ Telegram destination mapping
- Devices in location inherit group policies automatically

**Result:** Complete infrastructure ready for device assignment in <30 seconds.

---

## Creating Locations

### Via Web UI

1. **Navigate to Locations**
   - Click **Locations** in main navigation menu
   - View existing locations table

2. **Click Add Location Button**
   - Located top-right of locations list

3. **Fill Location Form**
   - **Name:** (Required)
     - Descriptive identifier
     - Will be used for group and destination names
     - Example: "Tokyo Office", "DC1-Primary", "Customer-Acme"
     - Constraints: Alphanumeric, hyphens, underscores (no special characters)
   - **Description:** (Optional)
     - Additional context or notes
     - Example: "Main branch office - 150 employees - APAC region"
     - Supports multi-line text

4. **Click Save**
   - Auto-setup executes (2-3 seconds)
   - Progress indicator shows workflow steps

5. **Success Confirmation**
   - Green notification: "Location created with auto-generated group and Telegram destination"
   - Location appears in locations table
   - Device count shows 0 initially

### Via REST API

**Endpoint:** `POST /api/v1/locations`

**Authentication:** HTTP Basic Auth or session cookie

**Request Body:**
```json
{
  "name": "Tokyo Office",
  "description": "Main branch office in APAC region"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5005/api/v1/locations \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "name": "Tokyo Office",
    "description": "Main branch office"
  }'
```

**Response (201 Created):**
```json
{
  "id": 5,
  "name": "Tokyo Office",
  "description": "Main branch office",
  "device_count": 0,
  "group_id": 12,
  "telegram_destination_id": 8,
  "created_at": "2026-09-20T06:30:00Z",
  "updated_at": "2026-09-20T06:30:00Z"
}
```

**Error Responses:**

**409 Conflict** - Location name already exists:
```json
{
  "detail": "Location with name 'Tokyo Office' already exists"
}
```

**400 Bad Request** - Invalid input:
```json
{
  "detail": "Name cannot contain special characters: @ # $ %"
}
```

---

## Managing Locations

### Assigning Devices to Location

**Method 1: During Device Creation**

1. Navigate to **Devices** → **Add Device**
2. Fill in device details (hostname, IP, type, etc.)
3. Locate **Location** dropdown (near bottom of form)
4. Select desired location
5. Click **Save**
6. Device automatically:
   - Joins location's device group
   - Inherits group's backup destinations
   - Applies group's notification channels

**Method 2: Edit Existing Device**

1. Navigate to **Devices**
2. Click **edit icon** (pencil) next to device
3. Change **Location** dropdown value
4. Click **Save**
5. Device moves to new location:
   - Removed from old location's group
   - Added to new location's group
   - Backup destinations update automatically

**Method 3: Bulk Assignment (API)**

```bash
# Assign multiple devices to location
curl -X PATCH http://localhost:5005/api/v1/devices/bulk-update \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "device_ids": [1, 2, 3, 4, 5],
    "location_id": 5
  }'
```

### Viewing Location Details

**Web UI:**
1. Navigate to **Locations**
2. Table displays:
   - **Name:** Location identifier
   - **Description:** Additional details
   - **Device Count:** Number of assigned devices (clickable link)
   - **Created:** Timestamp
   - **Actions:** Edit, Delete icons

3. **Click device count** to view all devices in location
   - Redirects to Devices page filtered by location
   - Shows full device list with status, last backup, etc.

**API:**
```bash
# Get location details
curl -u admin:password \
  http://localhost:5005/api/v1/locations/5

# List all locations
curl -u admin:password \
  http://localhost:5005/api/v1/locations
```

### Editing Locations

**Web UI:**
1. Click **edit icon** next to location
2. Update name or description
3. Click **Save**

**Important Notes:**
- **Auto-generated group name does NOT update** (prevents breaking existing schedules)
- **Telegram destination name remains unchanged** (maintains notification continuity)
- Only location's own name/description update
- Devices remain assigned, no disruption to backups

**API:**
```bash
curl -X PUT http://localhost:5005/api/v1/locations/5 \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "name": "Tokyo Office - Updated",
    "description": "New description"
  }'
```

### Deleting Locations

Two deletion modes: **Soft Delete** (default) and **Hard Delete** (permanent).

#### Soft Delete (Default)

**Effect:**
- Location marked inactive/hidden from UI
- Not permanently removed from database
- Devices reassigned to "Default" location automatically
- Auto-generated group remains active
- Telegram destination preserved
- Can be restored via database if needed

**Use Cases:**
- Temporary site closure
- Organizational restructuring
- Testing/development environments
- Preserving historical data

**Steps (Web UI):**
1. Click **delete icon** (trash) next to location
2. Confirm deletion in modal
3. Default mode is soft delete
4. Devices automatically move to "Default" location
5. Success notification displayed

**API:**
```bash
# Soft delete (default)
curl -X DELETE http://localhost:5005/api/v1/locations/5 \
  -u admin:password

# Explicit soft delete
curl -X DELETE "http://localhost:5005/api/v1/locations/5?hard=false" \
  -u admin:password
```

#### Hard Delete (Permanent)

**Effect:**
- Location permanently removed from database
- Cannot be restored
- Devices reassigned to "Default" location
- Auto-generated device group **deleted**
  - Devices unlinked from group
  - Group-level schedules stop applying to these devices
- Telegram destination handling:
  - **Option 1:** Keep destination (default)
  - **Option 2:** Delete destination (must confirm)

**Use Cases:**
- Site permanently closed
- Cleanup after migration
- Removing test/demo locations
- Database housekeeping

**Steps (Web UI):**
1. Click **delete icon** next to location
2. Modal appears with delete options
3. Select **"Hard Delete (Permanent)"** checkbox
4. Choose Telegram destination handling:
   - ☐ Keep Telegram destination (other devices may use it)
   - ☑ Delete Telegram destination
5. Confirm deletion
6. Type location name to verify (safety check)
7. Click **Confirm Delete**

**API:**
```bash
# Hard delete, keep Telegram destination
curl -X DELETE "http://localhost:5005/api/v1/locations/5?hard=true&delete_destination=false" \
  -u admin:password

# Hard delete, remove Telegram destination too
curl -X DELETE "http://localhost:5005/api/v1/locations/5?hard=true&delete_destination=true" \
  -u admin:password
```

**⚠️ Warning:** Hard delete cannot be undone. Backup schedules referencing the deleted group will fail until updated to reference remaining groups or specific devices.

---

## Use Cases

### 1. Multi-Site Enterprise Deployment

**Scenario:** Corporation with headquarters and 5 branch offices across regions

**Setup:**
1. Create locations:
   - HQ-NewYork
   - Branch-Tokyo
   - Branch-London
   - Branch-Sydney
   - Branch-Toronto
   - Branch-Singapore

2. For each location, auto-setup creates:
   - Dedicated Telegram channel for local IT team
   - Device group for location-specific policies
   - Automatic notification routing

3. Assign devices to respective locations during onboarding

4. Configure schedules:
   - All locations: Daily backup at 2 AM local time
   - HQ: Additional hourly snapshots for critical infrastructure

**Result:**
- Each branch backs up to own Telegram channel (local visibility)
- Central NOC monitors all via main Telegram channel
- Regional compliance (data stays in region if using local Git/SMB)
- Independent retention policies per location

**Benefits:**
- 5 locations × 10 min manual setup = 50 minutes → 5 minutes with auto-setup
- Consistent structure across all sites
- Easy onboarding of new branches

### 2. Managed Service Provider (MSP)

**Scenario:** MSP managing network infrastructure for 20 customers

**Setup:**
1. Create location per customer:
   - Customer-Acme-Corp
   - Customer-GlobalTech
   - Customer-FinanceServices
   - (17 more...)

2. Each customer gets:
   - Isolated Telegram channel (customer-specific notifications)
   - Dedicated device group
   - Separate retention policies

3. Configure customer-specific schedules
4. Set up per-customer notification channels (Slack, email)

**Result:**
- Complete customer data isolation
- Per-customer backup visibility and reporting
- Separate billing based on device count per location
- Easy customer offboarding (soft delete location)

**Analytics Benefits:**
- Group analytics shows per-customer success rates
- Individual customer SLA reporting
- Capacity planning per customer

### 3. Departmental Organization

**Scenario:** Large enterprise with IT, Engineering, Operations departments

**Setup:**
1. Create locations:
   - IT-Infrastructure
   - Engineering-Lab
   - Operations-Production
   - Security-Management

2. Assign devices by ownership:
   - IT: Core routers, switches, firewalls
   - Engineering: Lab equipment, test devices
   - Operations: Production servers, monitoring devices
   - Security: IDS/IPS, access controllers

3. Configure department-specific policies:
   - IT: Hourly backups, 90-day retention
   - Engineering: Daily backups, 30-day retention
   - Operations: Every 6 hours, 60-day retention
   - Security: Continuous, 365-day retention

**Result:**
- Department-level backup visibility
- Independent retention policies matching data criticality
- Cross-department reporting via analytics
- Clear ownership and accountability

### 4. Disaster Recovery Tiers

**Scenario:** Classify devices by business criticality and recovery priority

**Setup:**
1. Create locations by DR tier:
   - DR-Tier1-Critical (RTO: 1 hour, RPO: 15 minutes)
   - DR-Tier2-Important (RTO: 4 hours, RPO: 1 hour)
   - DR-Tier3-Standard (RTO: 24 hours, RPO: 6 hours)
   - DR-Tier4-BestEffort (RTO: 72 hours, RPO: 24 hours)

2. Assign devices based on business impact analysis

3. Configure backup frequency per tier:
   - Tier 1: Every 15 minutes
   - Tier 2: Hourly
   - Tier 3: Every 6 hours
   - Tier 4: Daily

4. Set retention matching compliance requirements

**Result:**
- Clear device inventory by criticality
- Optimized backup schedules (avoid over-backing up Tier 4)
- Faster recovery planning (know which devices to restore first)
- Cost optimization (intensive backups only for critical devices)

### 5. Geographic Compliance

**Scenario:** Multinational company with data sovereignty requirements

**Setup:**
1. Create locations by regulatory region:
   - EMEA-GDPR
   - APAC-Singapore
   - AMER-US
   - AMER-Canada

2. Configure region-specific destinations:
   - EMEA: Git repo hosted in EU, SMB share in Frankfurt
   - APAC: Git repo in Singapore, local storage
   - AMER-US: GitHub, S3 bucket in us-east-1
   - AMER-Canada: Local Canadian Git server

3. Assign devices to appropriate location during onboarding

**Result:**
- Data never leaves compliance boundary
- Audit trail by location
- Region-specific retention policies
- Easy compliance reporting per jurisdiction

---

## Integration with Other Features

### Group Profile Inheritance

Devices in location automatically inherit settings from location's auto-generated group:

**Inherited Properties:**
- **Backup destinations:** All destinations configured in group apply to devices
  - Device can add additional destinations
  - Device can override to use different destinations
- **Notification channels:** Alert routing rules from group
- **Backup engine preference:** Default engine for devices without explicit engine set
- **Schedules:** Group-level schedules apply to all devices in group

**Override Behavior:**
- Device settings take precedence over group settings
- Useful for exceptions (e.g., one device needs hourly backup while others daily)
- Override clearly indicated in device edit form

**Example:**
- Tokyo Office group has destinations: [Local, Git, Telegram-Tokyo]
- Device "core-switch-01" in Tokyo Office inherits all three destinations
- Device "test-router-05" in Tokyo Office overrides to use only Local destination

### Multi-Channel Telegram

Each location can have multiple Telegram notification paths:

**Configuration:**
1. Location-specific Telegram destination (auto-generated)
   - Local IT team visibility
   - Filters: Only devices in this location
2. Main monitoring Telegram channel
   - Central NOC visibility
   - All locations report here
3. Alert Telegram channel (optional)
   - Critical failures only
   - Cross-location monitoring

**Setup:**
- Auto-generated destination handles location-specific channel
- Add main channel to group notification settings
- Configure alert channel in notification rules

See [MULTI_CHANNEL_SETUP.md](MULTI_CHANNEL_SETUP.md) for detailed multi-channel configuration.

### Analytics Integration

Location-based analytics available via group analytics:

**Metrics per Location:**
- Backup success rate
- Device count
- Total backup size
- Last backup timestamp
- Average backup size per device

**Access:**
1. Navigate to **Analytics** → **Group Analytics**
2. Locations appear as groups (since location creates group)
3. Sort by any column to identify outliers
4. Export as CSV for external reporting

**Use Cases:**
- Compare backup health across locations
- Identify locations needing attention
- Capacity planning per site
- SLA reporting per location/customer

See [ANALYTICS.md](ANALYTICS.md) for complete analytics guide.

---

## Best Practices

### Naming Conventions

**Recommended Patterns:**

**Geographic locations:**
- Format: `{City}-{Purpose}`
- Examples: `Tokyo-Office`, `London-DC`, `Seattle-POP`

**Customer sites (MSP):**
- Format: `Customer-{Name}-{Site}`
- Examples: `Customer-Acme-HQ`, `Customer-GlobalTech-DR`

**Departments:**
- Format: `{Department}-{Function}`
- Examples: `IT-Infrastructure`, `Engineering-Lab`, `Operations-NOC`

**DR tiers:**
- Format: `DR-Tier{N}-{Label}`
- Examples: `DR-Tier1-Critical`, `DR-Tier3-Standard`

**Avoid:**
- Special characters: `@`, `#`, `$`, `%`, `&`, `*`
- Leading/trailing spaces
- Very long names (>50 characters)
- Ambiguous abbreviations
- Non-ASCII characters (if using API integrations)

### Location Hierarchy

HK-NOVA locations are flat (no parent-child relationships). Represent hierarchy via naming or description:

**Via Naming:**
- `APAC-Tokyo-Office`
- `APAC-Singapore-DC`
- `EMEA-London-Branch`

**Via Description:**
- Name: `Tokyo Office`
- Description: `APAC Region > Japan > Tokyo > Main Branch`

**Benefits:**
- Simple data model, easier to understand
- No cascading delete complexity
- Flexible reorganization

### Device Assignment Strategy

**During Initial Setup:**
- Assign location during device creation (fewer steps than editing later)
- Use import features that support location field
- Bulk assign via API for large deployments

**Ongoing Management:**
- Audit "Default" location monthly for unassigned devices
- Document location assignment policy
- Use consistent location naming across documentation

**Bulk Operations:**
- Script device-to-location mapping for large deployments
- Use CSV import if available (check API docs)
- Validate assignments before committing

### Telegram Channel Setup

**Before Creating Locations:**

1. **Create Telegram channels** for each location:
   - Use descriptive names: "HK-NOVA Tokyo Office Backups"
   - Set channel description with purpose
   - Configure channel admins

2. **Configure main bot:**
   - Create bot via @BotFather
   - Save bot token to HK-NOVA environment variable
   - Add bot to all location channels as admin

3. **Get chat IDs:**
   - Send test message to each channel
   - Use bot API to retrieve chat ID
   - Document chat ID mapping

4. **Create locations:**
   - Auto-setup generates Telegram destinations
   - Edit each destination to add correct chat ID
   - Test each destination

See [TELEGRAM_DESTINATION.md](TELEGRAM_DESTINATION.md) for detailed bot setup instructions.

### Cleanup and Maintenance

**Regular Audits:**
- Monthly: Review locations with 0 devices (candidates for deletion)
- Quarterly: Verify location assignments still accurate
- Annually: Consolidate similar/duplicate locations

**Deletion Strategy:**
- **Active sites moving:** Soft delete, preserve history
- **Permanent closure:** Hard delete after 90-day grace period
- **Before hard delete:** Export backup history for archives

**Documentation:**
- Maintain location inventory spreadsheet
- Document location-to-physical-site mapping
- Track location lifecycle (created, modified, deleted dates)

---

## Troubleshooting

### "Auto-setup failed: Telegram token not configured"

**Cause:** `TELEGRAM_BOT_TOKEN` not set in environment

**Solution:**
1. Configure bot token in `.env` file: `TELEGRAM_BOT_TOKEN=your-token-here`
2. Restart HK-NOVA
3. Retry location creation
4. **Alternative:** Create location anyway (Telegram destination will be skipped)

### "Group creation failed: name already exists"

**Cause:** Location name conflicts with existing device group

**Solutions:**
1. Choose different location name
2. **OR** Rename existing conflicting group
3. **OR** Delete unused conflicting group if safe

### Devices not inheriting location settings

**Cause:** Device has explicit destination override configured

**Symptoms:**
- Device shows different destinations than group
- Backups not going to location's Telegram channel

**Solution:**
1. Edit device
2. Find **Destinations** field
3. If populated, clear it to inherit from group
4. **OR** Explicitly add location's destinations to device list
5. Save device

### Location deleted but devices still show old location

**Cause:** Browser cache or page not refreshed

**Solution:**
1. Refresh browser page (F5 or Ctrl+R)
2. Devices should now show "Default" location
3. If persists, clear browser cache
4. Check database directly if issue continues

### Auto-generated group not visible

**Cause:** Group was manually deleted after location creation

**Solution:**
1. Edit location (via API or database)
2. Unlink group_id reference
3. Recreate group manually with same name
4. Link group to location via API

**Prevention:** Don't manually delete auto-generated groups; use location deletion instead

### Telegram destination not sending notifications

**Cause:** Chat ID not configured in auto-generated destination

**Symptoms:**
- Backups succeed but no Telegram messages
- Destination test fails with "Chat not found"

**Solution:**
1. Navigate to **Destinations**
2. Find location's Telegram destination: `{location_name} - Telegram`
3. Click **Edit**
4. Add **Chat ID** (negative number for channels)
5. Click **Test** to verify
6. Save destination

See [TELEGRAM_DESTINATION.md](TELEGRAM_DESTINATION.md) for getting chat ID.

---

## API Reference

### Create Location

**Endpoint:** `POST /api/v1/locations`

**Request:**
```json
{
  "name": "Tokyo Office",
  "description": "Main branch office"
}
```

**Response (201):**
```json
{
  "id": 5,
  "name": "Tokyo Office",
  "description": "Main branch office",
  "device_count": 0,
  "group_id": 12,
  "telegram_destination_id": 8,
  "created_at": "2026-09-20T06:30:00Z"
}
```

### List Locations

**Endpoint:** `GET /api/v1/locations`

**Response:**
```json
{
  "locations": [
    {
      "id": 5,
      "name": "Tokyo Office",
      "device_count": 25,
      "created_at": "2026-09-20T06:30:00Z"
    }
  ]
}
```

### Get Location Details

**Endpoint:** `GET /api/v1/locations/{id}`

**Response:**
```json
{
  "id": 5,
  "name": "Tokyo Office",
  "description": "Main branch office",
  "device_count": 25,
  "group_id": 12,
  "telegram_destination_id": 8,
  "devices": [
    {"id": 1, "hostname": "core-switch-01"},
    {"id": 2, "hostname": "edge-router-02"}
  ],
  "created_at": "2026-09-20T06:30:00Z",
  "updated_at": "2026-09-20T08:15:00Z"
}
```

### Update Location

**Endpoint:** `PUT /api/v1/locations/{id}`

**Request:**
```json
{
  "name": "Tokyo Office - Updated",
  "description": "New description"
}
```

**Response (200):**
```json
{
  "id": 5,
  "name": "Tokyo Office - Updated",
  "description": "New description",
  "device_count": 25,
  "updated_at": "2026-09-20T09:00:00Z"
}
```

### Delete Location

**Endpoint:** `DELETE /api/v1/locations/{id}`

**Query Parameters:**
- `hard` (boolean): `true` for permanent deletion, `false` for soft delete (default: `false`)
- `delete_destination` (boolean): Delete associated Telegram destination (only with `hard=true`, default: `false`)

**Examples:**
```bash
# Soft delete
DELETE /api/v1/locations/5?hard=false

# Hard delete, keep Telegram destination
DELETE /api/v1/locations/5?hard=true&delete_destination=false

# Hard delete, remove everything
DELETE /api/v1/locations/5?hard=true&delete_destination=true
```

**Response (204 No Content):** Empty response body

---

## Related Documentation

- **[MULTI_CHANNEL_SETUP.md](MULTI_CHANNEL_SETUP.md)** — Multi-channel Telegram configuration for departmental isolation
- **[TELEGRAM_DESTINATION.md](TELEGRAM_DESTINATION.md)** — Complete Telegram bot setup and chat ID retrieval
- **[ANALYTICS.md](ANALYTICS.md)** — Group-based analytics and location-level reporting
- **[DEVICES.md](DEVICES.md)** — Device management and assignment best practices
- **[CONFIGURATION.md](CONFIGURATION.md)** — Group settings and policy inheritance
- **[API.md](API.md)** — Complete REST API reference with authentication
