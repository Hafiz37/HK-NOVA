import logging
import re
import traceback
from datetime import datetime, timezone
from typing import Any
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.backup_failure import BackupFailure

logger = logging.getLogger(__name__)

# Transient error types that are eligible for retry
TRANSIENT_ERROR_TYPES = {
    "network_timeout",
    "network_connection",
    "rate_limit",
    "temporary_unavailable",
    "smb_temporary",
}

# Permanent error types that should NOT be retried
PERMANENT_ERROR_TYPES = {
    "auth_failure",
    "permission_denied",
    "invalid_config",
    "disk_full",
    "invalid_params",
    "unknown",
}


def classify_error(error: Exception | str) -> tuple[str, str]:
    """
    Classify an exception or error string into:
    (error_type, error_category)
    where error_category is either 'transient' or 'permanent'.
    """
    err_str = str(error).lower()
    err_cls = error.__class__.__name__.lower() if isinstance(error, Exception) else ""

    # 1. Rate Limit (429)
    if "429" in err_str or "rate limit" in err_str or "too many requests" in err_str:
        return "rate_limit", "transient"

    # 2. Authentication Failures (401, credentials) - Check this before generic connection errors!
    if (
        "401" in err_str
        or "unauthorized" in err_str
        or "auth" in err_str and ("fail" in err_str or "error" in err_str or "denied" in err_str)
        or "invalid credentials" in err_str
        or "invalid bot token" in err_str
        or "bad credentials" in err_str
        or "login failed" in err_str
        or "authentication failed" in err_str
        or "host key verification failed" in err_str
        or "permission denied (publickey)" in err_str
    ):
        return "auth_failure", "permanent"

    # 3. Authorization / Permission Denied (403, permissions)
    if (
        "403" in err_str
        or "forbidden" in err_str
        or "permission denied" in err_str
        or "access denied" in err_str
        or "insufficient write permissions" in err_str
        or "status_access_denied" in err_str
        or "operation not permitted" in err_str
    ):
        return "permission_denied", "permanent"

    # 4. Invalid configuration / Bad Request (400)
    if (
        "400" in err_str
        or "bad request" in err_str
        or "invalid configuration" in err_str
        or "malformed" in err_str
        or "missing required" in err_str
        or "no destination" in err_str
        or "requires 'bot_token'" in err_str
    ):
        return "invalid_config", "permanent"

    # 5. Resource exhausted (Disk full, ENOSPC)
    if (
        "disk full" in err_str
        or "no space left on device" in err_str
        or "enospc" in err_str
        or "quota exceeded" in err_str
        or "resource exhausted" in err_str
    ):
        return "disk_full", "permanent"

    # 6. Invalid parameters
    if (
        "invalid parameter" in err_str
        or "invalid argument" in err_str
        or "valueerror" in err_cls
        or "typeerror" in err_cls
    ):
        return "invalid_params", "permanent"

    # 7. SMB temporary issues
    if (
        "status_network_name_deleted" in err_str
        or "status_io_timeout" in err_str
        or "status_pipe_disconnected" in err_str
        or "status_connection_reset" in err_str
        or "status_user_session_deleted" in err_str
    ):
        return "smb_temporary", "transient"

    # 8. Network timeout
    if (
        "timeout" in err_str
        or "timed out" in err_str
        or "timeouterror" in err_cls
        or "readtimeout" in err_cls
        or "connecttimeout" in err_cls
    ):
        return "network_timeout", "transient"

    # 9. Network connection failures
    if (
        "connection refused" in err_str
        or "connection reset" in err_str
        or "network is unreachable" in err_str
        or "failed to connect" in err_str
        or "no route to host" in err_str
        or "connection error" in err_str
        or "connecterror" in err_cls
        or "connectionrefusederror" in err_cls
        or "connectionreseterror" in err_cls
        or "connectionerror" in err_cls
        or "getaddrinfo failed" in err_str
        or "dns resolution" in err_str
    ):
        return "network_connection", "transient"

    # 10. Temporary service unavailable (502, 503, 504)
    if (
        "502" in err_str
        or "503" in err_str
        or "504" in err_str
        or "service unavailable" in err_str
        or "temporarily unavailable" in err_str
        or "bad gateway" in err_str
        or "gateway timeout" in err_str
    ):
        return "temporary_unavailable", "transient"

    # Default to permanent unknown error if unclassified
    return "unknown", "permanent"


def is_retryable(error_category: str) -> bool:
    """Return True if the error category allows retrying."""
    return error_category == "transient"


def calculate_backoff(
    attempt: int,
    base_delay: int | None = None,
    max_delay: int | None = None,
    retry_after: int | None = None,
) -> float:
    """
    Calculate exponential backoff delay in seconds:
    - Attempt 1: base_delay^1 = 2 seconds
    - Attempt 2: base_delay^2 = 4 seconds
    - Attempt 3: base_delay^3 = 8 seconds
    - If retry_after is provided (e.g. from 429), respect it capped by max_delay.
    """
    settings = get_settings()
    base = base_delay if base_delay is not None else getattr(settings, "BACKUP_RETRY_BASE_DELAY", 2)
    maximum = max_delay if max_delay is not None else getattr(settings, "BACKUP_RETRY_MAX_DELAY", 60)

    if retry_after is not None and retry_after > 0:
        return float(min(retry_after, maximum))

    # Exponential backoff: base^attempt
    delay = float(base ** attempt)
    return min(delay, float(maximum))


def record_backup_failure(
    db: Session,
    device_id: int,
    backup_id: int | None,
    error_type: str,
    error_category: str,
    retry_count: int,
    max_retries: int,
    destination_type: str | None,
    destination_name: str | None,
    error_message: str | None,
    error_traceback: str | None = None,
    auto_fix_attempted: bool = False,
    auto_fix_result: str | None = None,
    root_cause_analysis: str | None = None,
    suggested_solution: str | None = None,
) -> BackupFailure:
    """Record a failure entry in the database."""
    failure = BackupFailure(
        backup_id=backup_id,
        device_id=device_id,
        error_type=error_type,
        error_category=error_category,
        retry_count=retry_count,
        max_retries=max_retries,
        destination_type=destination_type,
        destination_name=destination_name,
        error_message=error_message,
        error_traceback=error_traceback,
        auto_fix_attempted=auto_fix_attempted,
        auto_fix_result=auto_fix_result,
        root_cause_analysis=root_cause_analysis,
        suggested_solution=suggested_solution,
        resolved=False,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(failure)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record backup failure: {e}")
    return failure

