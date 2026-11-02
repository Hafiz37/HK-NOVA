"""Tests for backup retry logic and error classification."""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.modules.retry_service import (
    classify_error,
    is_retryable,
    calculate_backoff,
)


class TestErrorClassification:
    """Test classification into transient vs permanent errors."""

    def test_transient_network_timeout(self):
        err_type, category = classify_error(TimeoutError("Connection timed out"))
        assert err_type == "network_timeout"
        assert category == "transient"
        assert is_retryable(category) is True

    def test_transient_connection_refused(self):
        err_type, category = classify_error(ConnectionRefusedError("Connection refused by peer"))
        assert err_type == "network_connection"
        assert category == "transient"
        assert is_retryable(category) is True

    def test_transient_rate_limit(self):
        err_type, category = classify_error("HTTP 429 Too Many Requests: retry after 10")
        assert err_type == "rate_limit"
        assert category == "transient"
        assert is_retryable(category) is True

    def test_transient_smb_temporary(self):
        err_type, category = classify_error("STATUS_NETWORK_NAME_DELETED during write")
        assert err_type == "smb_temporary"
        assert category == "transient"
        assert is_retryable(category) is True

    def test_permanent_auth_failure(self):
        err_type, category = classify_error("401 Unauthorized: Invalid credentials")
        assert err_type == "auth_failure"
        assert category == "permanent"
        assert is_retryable(category) is False

    def test_permanent_permission_denied(self):
        err_type, category = classify_error(PermissionError("Permission denied: insufficient write permissions"))
        assert err_type == "permission_denied"
        assert category == "permanent"
        assert is_retryable(category) is False

    def test_permanent_disk_full(self):
        err_type, category = classify_error(OSError(28, "No space left on device"))
        assert err_type == "disk_full"
        assert category == "permanent"
        assert is_retryable(category) is False

    def test_permanent_invalid_config(self):
        err_type, category = classify_error("400 Bad Request: missing required field 'bot_token'")
        assert err_type == "invalid_config"
        assert category == "permanent"
        assert is_retryable(category) is False

    def test_permanent_invalid_params(self):
        err_type, category = classify_error(ValueError("invalid parameter passed"))
        assert err_type == "invalid_params"
        assert category == "permanent"
        assert is_retryable(category) is False


class TestBackoffCalculation:
    """Test exponential backoff calculations."""

    def test_exponential_backoff_delays(self):
        # Base 2: Attempt 1 -> 2s, Attempt 2 -> 4s, Attempt 3 -> 8s
        assert calculate_backoff(attempt=1, base_delay=2, max_delay=60) == 2.0
        assert calculate_backoff(attempt=2, base_delay=2, max_delay=60) == 4.0
        assert calculate_backoff(attempt=3, base_delay=2, max_delay=60) == 8.0

    def test_rate_limit_with_retry_after(self):
        # When retry_after is provided, it should respect retry_after capped at max_delay
        delay = calculate_backoff(attempt=1, base_delay=2, max_delay=60, retry_after=15)
        assert delay == 15.0

        delay_capped = calculate_backoff(attempt=1, base_delay=2, max_delay=30, retry_after=45)
        assert delay_capped == 30.0


@pytest.mark.asyncio
class TestDestinationRetryExecution:
    """Test retry attempts count for transient vs permanent errors in backup service."""

    async def test_retry_with_transient_error_exhausts_retries(self):
        from app.models.device import Device
        from app.models.backup import Backup, BackupStatus
        from app.models.destination import Destination, DestinationType
        from app.modules.backup_service import _handle_text_backup

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        device = Device(id=1, hostname="router-01", ip_address="192.168.1.1", device_type="cisco_ios")
        backup = Backup(id=1, device_id=1, status=BackupStatus.in_progress)
        dest = Destination(id=10, name="Remote SMB", dest_type=DestinationType.smb, enabled=True, config_json={})

        mock_backend = MagicMock()
        mock_backend.save = AsyncMock(side_effect=TimeoutError("Network timeout connecting to server"))

        with patch("app.modules.backup_service._resolve_destinations", return_value=[dest]), \
             patch("app.modules.backup_service.get_destination", return_value=mock_backend), \
             patch("app.modules.backup_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
             patch("app.modules.backup_service._save_to_local_fallback", new_callable=AsyncMock, return_value=True), \
             patch("app.modules.backup_service.send_failure_diagnostic_notification", new_callable=AsyncMock):

            await _handle_text_backup(mock_db, device, backup, "config text", [10])

            # Should have retried 3 times (attempts 1, 2, 3)
            assert mock_backend.save.call_count == 3
            # Should have slept between retries (2 times before attempts 2 and 3)
            assert mock_sleep.call_count == 2

    async def test_no_retry_with_permanent_error(self):
        from app.models.device import Device
        from app.models.backup import Backup, BackupStatus
        from app.models.destination import Destination, DestinationType
        from app.modules.backup_service import _handle_text_backup

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        device = Device(id=1, hostname="router-01", ip_address="192.168.1.1", device_type="cisco_ios")
        backup = Backup(id=1, device_id=1, status=BackupStatus.in_progress)
        dest = Destination(id=11, name="Git Backup", dest_type=DestinationType.git, enabled=True, config_json={})

        mock_backend = MagicMock()
        mock_backend.save = AsyncMock(side_effect=Exception("401 Unauthorized: Invalid credentials"))

        with patch("app.modules.backup_service._resolve_destinations", return_value=[dest]), \
             patch("app.modules.backup_service.get_destination", return_value=mock_backend), \
             patch("app.modules.backup_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
             patch("app.modules.backup_service._save_to_local_fallback", new_callable=AsyncMock, return_value=True), \
             patch("app.modules.backup_service.send_failure_diagnostic_notification", new_callable=AsyncMock):

            await _handle_text_backup(mock_db, device, backup, "config text", [11])

            # Should only attempt once because auth_failure is permanent
            assert mock_backend.save.call_count == 1
            assert mock_sleep.call_count == 0

