"""Tests for Auto-Fix strategies."""

import pytest
from unittest.mock import patch, MagicMock

from app.modules.auto_fix import (
    auto_fix_network_timeout,
    auto_fix_git_conflict,
    auto_fix_smb_dns,
    auto_fix_rate_limit,
    extract_retry_after,
    apply_auto_fix,
)


@pytest.mark.asyncio
class TestAutoFixStrategies:
    """Test individual auto-fix strategies."""

    async def test_network_timeout_increase_strategy(self):
        config = {"timeout": 30.0}
        error = TimeoutError("Connection timed out")

        result = await auto_fix_network_timeout(error, config)

        assert result["applied"] is True
        assert result["strategy"] == "increase_timeout"
        # 30.0 * 2.0 = 60.0
        assert config["timeout"] == 60.0

        # Run again to ensure progressive increase up to 300s
        await auto_fix_network_timeout(error, config)
        assert config["timeout"] == 120.0

        config["timeout"] = 250.0
        await auto_fix_network_timeout(error, config)
        assert config["timeout"] == 300.0  # capped at 300s

    async def test_extract_retry_after_and_auto_fix_rate_limit(self):
        error_str = "Telegram API error 429: Too Many Requests: retry after 25"
        retry_after = extract_retry_after(error_str)
        assert retry_after == 25

        config = {}
        res = await auto_fix_rate_limit(error_str, config)
        assert res["applied"] is True
        assert res["strategy"] == "rate_limit_cooldown"
        assert res["delay"] == 25

    async def test_git_pull_strategy(self):
        config = {"repo_path": "/tmp/test-repo", "branch": "main"}
        error = "Updates were rejected because the remote contains work that you do not have locally"

        with patch("os.path.exists", return_value=True), \
             patch("git.Repo") as mock_git_repo:
            mock_repo_instance = MagicMock()
            mock_remote = MagicMock()
            mock_remote.name = "origin"
            mock_repo_instance.remotes = [mock_remote]
            mock_git_repo.return_value = mock_repo_instance

            with patch("app.modules.destinations.git_destination.GitDestination._build_push_env", return_value={}):
                result = await auto_fix_git_conflict(error, config)

                assert result["applied"] is True
                assert result["strategy"] == "git_pull_conflict_resolution"

    async def test_smb_dns_resolution_strategy(self):
        config = {"server": "nas-storage.local"}
        error = "Failed to connect to nas-storage.local: getaddrinfo failed"

        with patch("socket.gethostbyname", return_value="192.168.1.150"):
            result = await auto_fix_smb_dns(error, config)

            assert result["applied"] is True
            assert result["strategy"] == "smb_dns_resolution"
            assert result["resolved_ip"] == "192.168.1.150"
            assert config["server"] == "192.168.1.150"

    async def test_apply_auto_fix_dispatcher(self):
        config = {"timeout": 15.0}
        res = await apply_auto_fix("network_timeout", TimeoutError("timed out"), "local", config)
        assert res["applied"] is True
        assert res["strategy"] == "increase_timeout"
        assert config["timeout"] == 30.0
