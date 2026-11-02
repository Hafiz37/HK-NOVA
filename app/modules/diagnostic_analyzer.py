import logging
from typing import Any

logger = logging.getLogger(__name__)


def analyze_backup_failure(
    device: Any,
    backup: Any,
    failures_list: list[Any]
) -> dict[str, Any]:
    """
    Comprehensive root cause analysis for backup failures.

    Input:
      - device: Device object
      - backup: Backup object
      - failures_list: list of (destination, error_type, error_msg, retry_count)
                       or dicts with corresponding keys

    Output:
      {
          "primary_cause": str,
          "affected_destinations": list[str],
          "common_pattern": str,
          "solution_steps": list[str],
          "severity": "high" | "medium" | "low",
          "is_device_issue": bool,
          "quick_fix": str | None,
          "documentation_link": str | None
      }
    """
    device_ip = getattr(device, "ip_address", "unknown_ip")
    hostname = getattr(device, "hostname", "unknown_device")

    # Normalize failures_list
    normalized_failures: list[dict[str, Any]] = []
    for item in failures_list:
        if isinstance(item, dict):
            dest = item.get("destination", "unknown")
            dest_name = getattr(dest, "name", str(dest))
            dest_type = getattr(dest, "dest_type", {}).value if hasattr(getattr(dest, "dest_type", None), "value") else str(getattr(dest, "dest_type", "unknown"))
            normalized_failures.append({
                "destination_name": dest_name,
                "dest_type": dest_type,
                "error_type": item.get("error_type", "unknown"),
                "error_msg": str(item.get("error_msg", "")),
                "retry_count": item.get("retry_count", 0),
            })
        elif isinstance(item, (tuple, list)) and len(item) >= 3:
            dest = item[0]
            dest_name = getattr(dest, "name", str(dest))
            dest_type = getattr(dest, "dest_type", {}).value if hasattr(getattr(dest, "dest_type", None), "value") else str(getattr(dest, "dest_type", "unknown"))
            error_type = item[1]
            error_msg = str(item[2])
            retry_count = item[3] if len(item) > 3 else 0
            normalized_failures.append({
                "destination_name": dest_name,
                "dest_type": dest_type,
                "error_type": error_type,
                "error_msg": error_msg,
                "retry_count": retry_count,
            })

    affected_destinations = [f["destination_name"] for f in normalized_failures]
    error_types = [f["error_type"] for f in normalized_failures]
    all_msgs = " ".join([f["error_msg"] for f in normalized_failures]).lower()

    # Case 0: No destination failures passed, but backup has error_message (e.g. Device config fetch failed)
    if not normalized_failures:
        backup_err = str(getattr(backup, "error_message", "")).lower()
        if "no credential" in backup_err:
            return {
                "primary_cause": "No credential assigned to device",
                "affected_destinations": [],
                "common_pattern": "missing_credential",
                "solution_steps": [
                    "Assign a valid credential to the device in device settings",
                    "Verify credential has appropriate SSH or API permissions",
                    "Test connection via the Devices page",
                ],
                "severity": "high",
                "is_device_issue": True,
                "quick_fix": f"Edit device '{hostname}' and assign a credential",
                "documentation_link": "/docs/devices#credentials",
            }
        elif "timeout" in backup_err or "unreachable" in backup_err:
            return {
                "primary_cause": "Device unreachable or network connectivity issue",
                "affected_destinations": [],
                "common_pattern": "device_network_timeout",
                "solution_steps": [
                    f"Check device is online: ping {device_ip}",
                    "Verify firewall rules",
                    "Test SSH/API connectivity manually",
                ],
                "severity": "high",
                "is_device_issue": True,
                "quick_fix": f"Ping device at {device_ip} to verify network status",
                "documentation_link": "/docs/troubleshooting#connectivity",
            }
        elif "auth" in backup_err or "401" in backup_err or "denied" in backup_err:
            return {
                "primary_cause": "Device authentication failed",
                "affected_destinations": [],
                "common_pattern": "device_auth_failure",
                "solution_steps": [
                    "Verify username and password/SSH key in credentials",
                    "Check device AAA or user lockout status",
                    "Verify enable password if privileged mode is required",
                ],
                "severity": "high",
                "is_device_issue": True,
                "quick_fix": "Verify and update device credential in Credentials page",
                "documentation_link": "/docs/credentials",
            }
        else:
            return {
                "primary_cause": getattr(backup, "error_message", "Unknown backup error") or "Backup fetch failed",
                "affected_destinations": [],
                "common_pattern": "fetch_error",
                "solution_steps": [
                    "Check device configuration and credentials",
                    "Verify network reachability and port settings",
                ],
                "severity": "medium",
                "is_device_issue": True,
                "quick_fix": "Test connection to device",
                "documentation_link": "/docs/troubleshooting",
            }

    # Case 1: All destinations failed with network timeout
    if error_types and all(et == "network_timeout" for et in error_types):
        return {
            "primary_cause": "Device unreachable or network connectivity issue",
            "affected_destinations": affected_destinations,
            "common_pattern": "all_network_timeout",
            "solution_steps": [
                f"Check device is online: ping {device_ip}",
                "Verify firewall rules",
                "Test SSH/API connectivity manually",
            ],
            "severity": "high",
            "is_device_issue": True,
            "quick_fix": f"Verify network route to {device_ip}",
            "documentation_link": "/docs/troubleshooting#network-timeout",
        }

    # Case 2: Git authentication failure
    has_git = any("git" in f["dest_type"].lower() or "git" in f["destination_name"].lower() for f in normalized_failures)
    git_auth_failed = any(
        ("git" in f["dest_type"].lower() or "git" in f["destination_name"].lower())
        and (f["error_type"] == "auth_failure" or "auth" in f["error_msg"].lower() or "key" in f["error_msg"].lower() or "401" in f["error_msg"])
        for f in normalized_failures
    )
    if git_auth_failed:
        return {
            "primary_cause": "Invalid or expired Git credentials",
            "affected_destinations": affected_destinations,
            "common_pattern": "git_auth_failure",
            "solution_steps": [
                "Check SSH key is added to Git server",
                "Verify personal access token is valid",
                "Test git push manually from server",
            ],
            "severity": "medium",
            "is_device_issue": False,
            "quick_fix": "Update Git token or SSH key in Destination configuration",
            "documentation_link": "/docs/destinations#git",
        }

    # Case 3: Telegram rate limit (429)
    telegram_rate_limited = any(
        f["error_type"] == "rate_limit" or "429" in f["error_msg"] or "rate" in f["error_msg"].lower()
        for f in normalized_failures
    )
    if telegram_rate_limited:
        return {
            "primary_cause": "Telegram API rate limit exceeded",
            "affected_destinations": affected_destinations,
            "common_pattern": "telegram_rate_limit",
            "solution_steps": [
                "Wait for rate limit cooldown (auto-retried)",
                "Consider reducing backup frequency",
                "Split large files if possible",
            ],
            "severity": "low",
            "is_device_issue": False,
            "quick_fix": "Wait for Telegram rate limit cooldown",
            "documentation_link": "/docs/destinations#telegram",
        }

    # Case 4: SMB permission denied
    smb_permission_denied = any(
        "smb" in f["dest_type"].lower()
        and (f["error_type"] == "permission_denied" or "permission" in f["error_msg"].lower() or "access_denied" in f["error_msg"].lower() or "403" in f["error_msg"])
        for f in normalized_failures
    )
    if smb_permission_denied:
        return {
            "primary_cause": "Insufficient write permissions on SMB share",
            "affected_destinations": affected_destinations,
            "common_pattern": "smb_permission_denied",
            "solution_steps": [
                "Verify SMB credentials have write access",
                "Check share permissions on server",
                "Test manual write to share",
            ],
            "severity": "medium",
            "is_device_issue": False,
            "quick_fix": "Grant write access permissions to user on SMB share",
            "documentation_link": "/docs/destinations#smb",
        }

    # Case 5: SMB DNS / Connection issue
    smb_conn_issue = any(
        "smb" in f["dest_type"].lower()
        and (f["error_type"] in ("network_connection", "smb_temporary") or "getaddrinfo" in f["error_msg"].lower() or "dns" in f["error_msg"].lower())
        for f in normalized_failures
    )
    if smb_conn_issue:
        return {
            "primary_cause": "SMB share host unreachable or DNS resolution failed",
            "affected_destinations": affected_destinations,
            "common_pattern": "smb_host_unreachable",
            "solution_steps": [
                "Verify SMB hostname can be resolved from HK-NOVA host",
                "Use direct IP address instead of hostname in SMB destination",
                "Ensure port 445 is open and reachable on destination server",
            ],
            "severity": "medium",
            "is_device_issue": False,
            "quick_fix": "Switch SMB host configuration to static IP address",
            "documentation_link": "/docs/destinations#smb",
        }

    # Case 6: Disk full
    disk_full = any(f["error_type"] == "disk_full" or "space" in f["error_msg"].lower() or "enospc" in f["error_msg"].lower() for f in normalized_failures)
    if disk_full:
        return {
            "primary_cause": "Storage destination disk full",
            "affected_destinations": affected_destinations,
            "common_pattern": "disk_full",
            "solution_steps": [
                "Check available disk space on target destination volume",
                "Trigger retention sweep to prune expired backups",
                "Expand volume capacity or allocate more storage quota",
            ],
            "severity": "high",
            "is_device_issue": False,
            "quick_fix": "Free up space on storage destination",
            "documentation_link": "/docs/storage#retention",
        }

    # Case 7: Mixed failures or default
    return {
        "primary_cause": "Partial destination failures",
        "affected_destinations": affected_destinations,
        "common_pattern": "mixed_failures",
        "solution_steps": [
            "Review failed destination configurations",
            "Check connectivity to failed destinations",
        ],
        "severity": "low",
        "is_device_issue": False,
        "quick_fix": "Inspect error logs for the specific failed destinations",
        "documentation_link": "/docs/destinations",
    }

