import logging
import re
import socket
import asyncio
from typing import Any
from app.config import get_settings

logger = logging.getLogger(__name__)


def extract_retry_after(error: Exception | str) -> int | None:
    """Extract Retry-After value in seconds from exception or message."""
    if hasattr(error, "response") and error.response is not None:
        headers = getattr(error.response, "headers", {})
        if "Retry-After" in headers:
            try:
                return int(headers["Retry-After"])
            except (ValueError, TypeError):
                pass
        try:
            data = error.response.json()
            if isinstance(data, dict):
                params = data.get("parameters", {})
                if "retry_after" in params:
                    return int(params["retry_after"])
        except Exception:
            pass

    err_str = str(error)
    # Search for retry after patterns like "retry after 12 seconds" or "retry_after: 12"
    match = re.search(r"retry[-_ ]after[^\d]*(\d+)", err_str, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except (ValueError, TypeError):
            pass
    return None


async def auto_fix_rate_limit(error: Exception | str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Auto-fix Strategy A: Rate Limit
    Respect Retry-After header and cooldown
    """
    retry_after = extract_retry_after(error) or 2
    logger.info(f"Auto-fix: Waiting {retry_after} seconds for rate limit cooldown")
    return {
        "applied": True,
        "strategy": "rate_limit_cooldown",
        "delay": retry_after,
        "message": f"Auto-fix: Waiting {retry_after} seconds for rate limit cooldown",
    }


async def auto_fix_network_timeout(error: Exception | str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Auto-fix Strategy B: Network Timeout
    Progressively increase timeout: current_timeout * 2 (max 300s)
    """
    settings = get_settings()
    multiplier = getattr(settings, "BACKUP_AUTO_FIX_TIMEOUT_MULTIPLIER", 2.0)
    
    old_timeout = config.get("timeout", 30.0)
    if not isinstance(old_timeout, (int, float)):
        try:
            old_timeout = float(old_timeout)
        except (ValueError, TypeError):
            old_timeout = 30.0

    new_timeout = min(old_timeout * multiplier, 300.0)
    config["timeout"] = new_timeout

    logger.info(f"Auto-fix: Increased timeout from {int(old_timeout) if old_timeout.is_integer() else old_timeout}s to {int(new_timeout) if new_timeout.is_integer() else new_timeout}s")
    return {
        "applied": True,
        "strategy": "increase_timeout",
        "old_timeout": old_timeout,
        "new_timeout": new_timeout,
        "message": f"Auto-fix: Increased timeout from {old_timeout}s to {new_timeout}s",
    }


async def auto_fix_git_conflict(error: Exception | str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Auto-fix Strategy C: Git Push Conflict
    Attempt pull before retry push
    """
    repo_path = config.get("repo_path", "./repos/device-configs")
    branch = config.get("branch", "main")

    def _pull() -> bool:
        import os
        import git

        if not os.path.exists(os.path.join(repo_path, ".git")):
            return False

        repo = git.Repo(repo_path)
        remote = None
        for r in repo.remotes:
            if r.name == "origin":
                remote = r
                break

        if not remote:
            return False

        from app.modules.destinations.git_destination import GitDestination
        push_env = GitDestination._build_push_env(config)
        with repo.git.custom_environment(**push_env):
            remote.pull(refspec=branch)
        return True

    try:
        success = await asyncio.to_thread(_pull)
        if success:
            logger.info("Auto-fix: Pulled latest changes to resolve conflict")
            return {
                "applied": True,
                "strategy": "git_pull_conflict_resolution",
                "message": "Auto-fix: Pulled latest changes to resolve conflict",
            }
        else:
            return {
                "applied": False,
                "strategy": "git_pull_conflict_resolution",
                "message": "Auto-fix failed: Repo or remote not configured",
            }
    except Exception as e:
        logger.warning(f"Auto-fix git pull failed: {e}")
        return {
            "applied": False,
            "strategy": "git_pull_conflict_resolution",
            "message": f"Auto-fix git pull failed: {e}",
        }


async def auto_fix_smb_dns(error: Exception | str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Auto-fix Strategy D: SMB DNS Resolution
    If hostname connection fails, try resolve to IP and retry
    """
    server = config.get("server", "")
    if not server:
        return {"applied": False, "strategy": "smb_dns_resolution", "message": "No server specified"}

    # Check if already IP address
    ip_pattern = r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
    if re.match(ip_pattern, server):
        return {"applied": False, "strategy": "smb_dns_resolution", "message": "Server is already an IP address"}

    def _resolve(hostname: str) -> str | None:
        try:
            return socket.gethostbyname(hostname)
        except Exception:
            return None

    resolved_ip = await asyncio.to_thread(_resolve, server)
    if resolved_ip:
        config["_orig_server"] = server
        config["server"] = resolved_ip
        logger.info(f"Auto-fix: Resolved {server} to {resolved_ip}")
        return {
            "applied": True,
            "strategy": "smb_dns_resolution",
            "hostname": server,
            "resolved_ip": resolved_ip,
            "message": f"Auto-fix: Resolved {server} to {resolved_ip}",
        }

    return {
        "applied": False,
        "strategy": "smb_dns_resolution",
        "message": f"Auto-fix failed: Could not resolve DNS for {server}",
    }


async def apply_auto_fix(
    error_type: str,
    error: Exception | str,
    dest_type: str,
    config: dict[str, Any]
) -> dict[str, Any]:
    """
    Dispatch auto-fix based on error type and destination type.
    """
    settings = get_settings()
    if not getattr(settings, "BACKUP_AUTO_FIX_ENABLED", True):
        return {"applied": False, "strategy": "disabled", "message": "Auto-fix is disabled"}

    err_str = str(error).lower()

    if error_type == "rate_limit" or "429" in err_str:
        return await auto_fix_rate_limit(error, config)

    if error_type == "network_timeout" or "timeout" in err_str:
        return await auto_fix_network_timeout(error, config)

    if dest_type in ("git", "github", "gitea") and ("conflict" in err_str or "rejected" in err_str or "non-fast-forward" in err_str):
        return await auto_fix_git_conflict(error, config)

    if dest_type == "smb" and ("dns" in err_str or "getaddrinfo" in err_str or "name resolution" in err_str or "unreachable" in err_str or "connection" in err_str):
        return await auto_fix_smb_dns(error, config)

    return {"applied": False, "strategy": "none", "message": "No matching auto-fix strategy"}
