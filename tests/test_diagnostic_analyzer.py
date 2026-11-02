"""Tests for Diagnostic Analyzer root cause analysis."""

import pytest
from app.modules.diagnostic_analyzer import analyze_backup_failure


class DummyDevice:
    def __init__(self, hostname="switch-core-01", ip_address="10.0.0.1", device_type="cisco_ios", group="core"):
        self.hostname = hostname
        self.ip_address = ip_address
        self.device_type = device_type
        self.group = group


class DummyBackup:
    def __init__(self, error_message=None):
        self.error_message = error_message


class DummyDest:
    def __init__(self, name="SMB Share", dest_type="smb"):
        self.name = name
        self.dest_type = dest_type


class TestDiagnosticAnalyzer:
    """Test root cause analysis across different failure patterns."""

    def test_all_network_timeout_analysis(self):
        device = DummyDevice()
        backup = DummyBackup()
        failures = [
            (DummyDest("SMB-01", "smb"), "network_timeout", "Connection timed out after 30s", 3),
            (DummyDest("Git-01", "git"), "network_timeout", "Operation timed out", 3),
        ]

        report = analyze_backup_failure(device, backup, failures)

        assert report["primary_cause"] == "Device unreachable or network connectivity issue"
        assert report["common_pattern"] == "all_network_timeout"
        assert report["severity"] == "high"
        assert report["is_device_issue"] is True
        assert any("ping" in step.lower() for step in report["solution_steps"])

    def test_git_auth_failure_analysis(self):
        device = DummyDevice()
        backup = DummyBackup()
        failures = [
            (DummyDest("GitHub Repo", "git"), "auth_failure", "Permission denied (publickey). Could not read from remote", 1),
        ]

        report = analyze_backup_failure(device, backup, failures)

        assert report["primary_cause"] == "Invalid or expired Git credentials"
        assert report["common_pattern"] == "git_auth_failure"
        assert report["severity"] == "medium"
        assert report["is_device_issue"] is False
        assert any("ssh key" in step.lower() or "token" in step.lower() for step in report["solution_steps"])

    def test_telegram_rate_limit_analysis(self):
        device = DummyDevice()
        backup = DummyBackup()
        failures = [
            (DummyDest("Telegram Channel", "telegram"), "rate_limit", "HTTP 429 Too Many Requests: retry after 30", 3),
        ]

        report = analyze_backup_failure(device, backup, failures)

        assert report["primary_cause"] == "Telegram API rate limit exceeded"
        assert report["common_pattern"] == "telegram_rate_limit"
        assert report["severity"] == "low"
        assert report["is_device_issue"] is False

    def test_smb_permission_denied_analysis(self):
        device = DummyDevice()
        backup = DummyBackup()
        failures = [
            (DummyDest("Storage SMB", "smb"), "permission_denied", "STATUS_ACCESS_DENIED: Write permission check failed", 1),
        ]

        report = analyze_backup_failure(device, backup, failures)

        assert report["primary_cause"] == "Insufficient write permissions on SMB share"
        assert report["common_pattern"] == "smb_permission_denied"
        assert report["severity"] == "medium"
        assert report["is_device_issue"] is False

    def test_mixed_failures_analysis(self):
        device = DummyDevice()
        backup = DummyBackup()
        failures = [
            (DummyDest("SMB Primary", "smb"), "invalid_config", "Invalid server path", 1),
            (DummyDest("Git Backup", "git"), "unknown", "Unknown error occurred", 1),
        ]

        report = analyze_backup_failure(device, backup, failures)

        assert report["primary_cause"] == "Partial destination failures"
        assert report["common_pattern"] == "mixed_failures"
        assert report["severity"] == "low"
        assert report["is_device_issue"] is False

    def test_device_fetch_missing_credential(self):
        device = DummyDevice()
        backup = DummyBackup(error_message="No credential assigned to device")
        failures = []

        report = analyze_backup_failure(device, backup, failures)

        assert report["primary_cause"] == "No credential assigned to device"
        assert report["common_pattern"] == "missing_credential"
        assert report["severity"] == "high"
        assert report["is_device_issue"] is True

