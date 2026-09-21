import gzip
import logging
import math
import asyncio
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.modules.destinations.base import DestinationBackend
from app.config import get_settings

logger = logging.getLogger(__name__)


class TelegramDestination(DestinationBackend):

    async def test(self, config: dict[str, Any]) -> dict:
        """Test Telegram bot token and chat accessibility.
        
        Returns {"ok": bool, "steps": [{"step": str, "ok": bool, "msg": str}]}
        """
        bot_token = config.get("bot_token", "").strip()
        chat_id = config.get("chat_id", "").strip()
        
        steps: list[dict] = []
        
        if not bot_token:
            steps.append({"step": "config", "ok": False, "msg": "Bot token is required"})
            return {"ok": False, "steps": steps}
        
        if not chat_id:
            steps.append({"step": "config", "ok": False, "msg": "Chat ID is required"})
            return {"ok": False, "steps": steps}
        
        steps.append({"step": "config", "ok": True, "msg": "Configuration validated"})
        
        try:
            url = f"https://api.telegram.org/bot{bot_token}/getMe"
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                result = response.json()
                
                if not result.get("ok"):
                    steps.append({"step": "bot_token", "ok": False, "msg": f"Invalid bot token: {result.get('description', 'Unknown error')}"})
                    return {"ok": False, "steps": steps}
                
                bot_info = result.get("result", {})
                bot_username = bot_info.get("username", "unknown")
                steps.append({"step": "bot_token", "ok": True, "msg": f"Bot authenticated: @{bot_username}"})
        
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                steps.append({"step": "bot_token", "ok": False, "msg": "Unauthorized: Invalid bot token"})
            else:
                steps.append({"step": "bot_token", "ok": False, "msg": f"HTTP error {e.response.status_code}"})
            return {"ok": False, "steps": steps}
        except Exception as e:
            steps.append({"step": "bot_token", "ok": False, "msg": f"Connection error: {str(e)}"})
            return {"ok": False, "steps": steps}
        
        try:
            url = f"https://api.telegram.org/bot{bot_token}/getChat"
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params={"chat_id": chat_id})
                response.raise_for_status()
                result = response.json()
                
                if not result.get("ok"):
                    error_desc = result.get("description", "Unknown error")
                    steps.append({"step": "chat_access", "ok": False, "msg": f"Cannot access chat: {error_desc}"})
                    return {"ok": False, "steps": steps}
                
                chat_info = result.get("result", {})
                chat_title = chat_info.get("title", chat_info.get("username", chat_id))
                steps.append({"step": "chat_access", "ok": True, "msg": f"Chat accessible: {chat_title}"})
        
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                error_data = e.response.json()
                steps.append({"step": "chat_access", "ok": False, "msg": f"Invalid chat ID: {error_data.get('description', 'Bad Request')}"})
            else:
                steps.append({"step": "chat_access", "ok": False, "msg": f"HTTP error {e.response.status_code}"})
            return {"ok": False, "steps": steps}
        except Exception as e:
            steps.append({"step": "chat_access", "ok": False, "msg": f"Connection error: {str(e)}"})
            return {"ok": False, "steps": steps}
        
        for s in steps:
            if s["ok"]:
                logger.info("Telegram test [%s] %s: %s", chat_id, s["step"], s["msg"])
            else:
                logger.warning("Telegram test [%s] %s: %s", chat_id, s["step"], s["msg"])
        
        return {"ok": True, "steps": steps}

    async def save(self, hostname: str, config_text: str, config: dict[str, Any]) -> str:
        bot_token = config.get("bot_token")
        chat_id = config.get("chat_id")
        compress = config.get("compress", False)
        max_file_size_mb = config.get("max_file_size_mb", 45)
        split_size_mb = config.get("split_size_mb", 40)

        if not bot_token or not chat_id:
            raise ValueError("Telegram destination requires 'bot_token' and 'chat_id' in config")

        device_meta = config.get("_device_meta", {})
        backup_meta = config.get("_backup_meta", {})

        group = device_meta.get("group", "default")
        timestamp_obj = backup_meta.get("timestamp", datetime.now(timezone.utc))
        timestamp_str = timestamp_obj.strftime("%Y-%m-%d_%H-%M-%S")

        safe_hostname = hostname.replace("/", "_").replace("\\", "_")
        safe_group = group.replace("/", "_").replace("\\", "_")
        base_filename = f"{safe_group}_{safe_hostname}_{timestamp_str}"

        file_extension = config.get("file_extension", "cfg")
        if file_extension != "cfg":
            logger.info(
                "Telegram: Using non-standard extension '.%s' for %s (group: %s)",
                file_extension, hostname, group
            )

        if compress:
            file_data = gzip.compress(config_text.encode("utf-8"))
            filename = f"{base_filename}.{file_extension}.gz"
        else:
            file_data = config_text.encode("utf-8")
            filename = f"{base_filename}.{file_extension}"

        file_size_mb = len(file_data) / (1024 * 1024)

        caption = self._format_caption(hostname, device_meta, backup_meta, "success")

        if file_size_mb <= max_file_size_mb:
            logger.info(
                "Telegram: Uploading %s (%.2f MB) to chat %s",
                filename, file_size_mb, chat_id
            )
            result = await self._upload_file_to_telegram(
                bot_token, chat_id, file_data, filename, caption
            )
            message_id = result.get("result", {}).get("message_id")
            return f"telegram:{chat_id}:{message_id}"
        else:
            logger.warning(
                "Telegram: File size %.2f MB exceeds limit, splitting into parts",
                file_size_mb
            )
            parts = self._split_file(file_data, base_filename, split_size_mb)
            message_ids = []

            for i, (part_data, part_filename) in enumerate(parts, start=1):
                part_caption = self._format_caption(
                    hostname, device_meta, backup_meta, "success",
                    part_info=f"[PART {i}/{len(parts)}]"
                )
                logger.info(
                    "Telegram: Uploading part %d/%d: %s (%.2f MB)",
                    i, len(parts), part_filename, len(part_data) / (1024 * 1024)
                )
                result = await self._upload_file_to_telegram(
                    bot_token, chat_id, part_data, part_filename, part_caption
                )
                message_id = result.get("result", {}).get("message_id")
                message_ids.append(str(message_id))

            return f"telegram:{chat_id}:{','.join(message_ids)}"

    async def save_binary(
        self,
        hostname: str,
        data: bytes,
        extension: str,
        config: dict[str, Any],
    ) -> str:
        bot_token = config.get("bot_token")
        chat_id = config.get("chat_id")
        max_file_size_mb = config.get("max_file_size_mb", 45)
        split_size_mb = config.get("split_size_mb", 40)

        if not bot_token or not chat_id:
            raise ValueError("Telegram destination requires 'bot_token' and 'chat_id' in config")

        device_meta = config.get("_device_meta", {})
        backup_meta = config.get("_backup_meta", {})

        group = device_meta.get("group", "default")
        timestamp_obj = backup_meta.get("timestamp", datetime.now(timezone.utc))
        timestamp_str = timestamp_obj.strftime("%Y-%m-%d_%H-%M-%S")

        safe_hostname = hostname.replace("/", "_").replace("\\", "_")
        safe_group = group.replace("/", "_").replace("\\", "_")
        base_filename = f"{safe_group}_{safe_hostname}_{timestamp_str}{extension}"

        file_size_mb = len(data) / (1024 * 1024)

        caption = self._format_caption(hostname, device_meta, backup_meta, "success", is_binary=True)

        if file_size_mb <= max_file_size_mb:
            logger.info(
                "Telegram: Uploading binary %s (%.2f MB) to chat %s",
                base_filename, file_size_mb, chat_id
            )
            result = await self._upload_file_to_telegram(
                bot_token, chat_id, data, base_filename, caption
            )
            message_id = result.get("result", {}).get("message_id")
            return f"telegram:{chat_id}:{message_id}"
        else:
            logger.warning(
                "Telegram: Binary file size %.2f MB exceeds limit, splitting into parts",
                file_size_mb
            )
            parts = self._split_file(data, base_filename, split_size_mb)
            message_ids = []

            for i, (part_data, part_filename) in enumerate(parts, start=1):
                part_caption = self._format_caption(
                    hostname, device_meta, backup_meta, "success",
                    is_binary=True, part_info=f"[PART {i}/{len(parts)}]"
                )
                logger.info(
                    "Telegram: Uploading binary part %d/%d: %s (%.2f MB)",
                    i, len(parts), part_filename, len(part_data) / (1024 * 1024)
                )
                result = await self._upload_file_to_telegram(
                    bot_token, chat_id, part_data, part_filename, part_caption
                )
                message_id = result.get("result", {}).get("message_id")
                message_ids.append(str(message_id))

            return f"telegram:{chat_id}:{','.join(message_ids)}"

    async def delete(self, path: str, config: dict[str, Any]) -> None:
        if not path.startswith("telegram:"):
            logger.warning("Telegram: Invalid path format for deletion: %s", path)
            return

        try:
            parts = path.split(":")
            chat_id = parts[1]
            message_ids_str = parts[2]
            message_ids = message_ids_str.split(",")

            bot_token = config.get("bot_token")
            if not bot_token:
                logger.warning("Telegram: No bot_token in config, cannot delete messages")
                return

            for message_id in message_ids:
                try:
                    await self._delete_telegram_message(bot_token, chat_id, message_id)
                    logger.info("Telegram: Deleted message %s from chat %s", message_id, chat_id)
                except Exception as e:
                    logger.warning(
                        "Telegram: Failed to delete message %s: %s (bot may not have admin rights)",
                        message_id, e
                    )
        except Exception as e:
            logger.error("Telegram: Error during delete operation: %s", e)

    async def _upload_file_to_telegram(
        self,
        bot_token: str,
        chat_id: str,
        file_data: bytes,
        filename: str,
        caption: str,
        retry_count: int = 3
    ) -> dict:
        url = f"https://api.telegram.org/bot{bot_token}/sendDocument"

        files = {
            "document": (filename, file_data)
        }
        data = {
            "chat_id": chat_id,
            "caption": caption
        }

        for attempt in range(retry_count):
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    response = await client.post(url, files=files, data=data)
                    response.raise_for_status()
                    result = response.json()

                    if not result.get("ok"):
                        raise Exception(f"Telegram API error: {result.get('description', 'Unknown error')}")

                    return result

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    retry_after = int(e.response.headers.get("Retry-After", 2 ** attempt))
                    logger.warning(
                        "Telegram: Rate limited, retrying after %d seconds (attempt %d/%d)",
                        retry_after, attempt + 1, retry_count
                    )
                    await asyncio.sleep(retry_after)
                elif e.response.status_code == 400:
                    error_data = e.response.json()
                    raise Exception(f"Telegram API error 400: {error_data.get('description', 'Bad Request')}")
                elif e.response.status_code == 401:
                    raise Exception("Telegram API error 401: Unauthorized - Invalid bot token")
                else:
                    if attempt < retry_count - 1:
                        wait_time = 2 ** attempt
                        logger.warning(
                            "Telegram: HTTP error %d, retrying in %d seconds (attempt %d/%d)",
                            e.response.status_code, wait_time, attempt + 1, retry_count
                        )
                        await asyncio.sleep(wait_time)
                    else:
                        raise
            except Exception as e:
                if attempt < retry_count - 1:
                    wait_time = 2 ** attempt
                    logger.warning(
                        "Telegram: Upload error: %s, retrying in %d seconds (attempt %d/%d)",
                        e, wait_time, attempt + 1, retry_count
                    )
                    await asyncio.sleep(wait_time)
                else:
                    raise

        raise Exception("Telegram: Upload failed after maximum retries")

    async def _delete_telegram_message(
        self,
        bot_token: str,
        chat_id: str,
        message_id: str
    ) -> dict:
        url = f"https://api.telegram.org/bot{bot_token}/deleteMessage"

        data = {
            "chat_id": chat_id,
            "message_id": message_id
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, data=data)
            response.raise_for_status()
            result = response.json()

            if not result.get("ok"):
                raise Exception(f"Telegram API error: {result.get('description', 'Unknown error')}")

            return result

    def _format_caption(
        self,
        hostname: str,
        device_meta: dict,
        backup_meta: dict,
        status: str = "success",
        is_binary: bool = False,
        part_info: str = ""
    ) -> str:
        status_emoji = "🟢" if status == "success" else "🔴"
        status_text = "SUCCESS" if status == "success" else "FAILED"

        timestamp_obj = backup_meta.get("timestamp", datetime.now(timezone.utc))
        hash_value = backup_meta.get("hash", "unknown")[:12]
        size_bytes = backup_meta.get("size", 0)
        size_str = self._format_file_size(size_bytes)

        tz_str = self._get_timezone_str(timestamp_obj)

        group = device_meta.get("group", "default")
        device_type = device_meta.get("device_type", "unknown")
        ip_address = device_meta.get("ip_address", "N/A")
        port = device_meta.get("port", 22)
        proxy_host = device_meta.get("proxy_host", "")
        enabled = device_meta.get("enabled", True)
        notes = device_meta.get("notes", "")

        enabled_str = "Yes" if enabled else "No"
        proxy_str = proxy_host if proxy_host else "None"

        notes_truncated = notes[:100] + "..." if notes and len(notes) > 100 else notes or "None"

        hashtag_hostname = hostname.replace(".", "_").replace("-", "_")
        hashtag_group = group.replace(" ", "_").replace("-", "_")
        hashtag_type = device_type.replace("_", "").replace("-", "")
        hashtag_date = timestamp_obj.strftime("%Y_%m_%d")
        hashtag_status = status

        part_text = f"\n{part_info}" if part_info else ""

        caption = f"""{status_emoji} BACKUP {status_text}: {hostname}{part_text}
━━━━━━━━━━━━━━━━━━━━━━━
📅 {tz_str}
🔑 Hash: {hash_value}...
📦 Size: {size_str}
🏷️ Group: {group}
🖥️ Type: {device_type}
📍 IP: {ip_address}
🔌 Port: {port}
🌐 Proxy: {proxy_str}
✅ Enabled: {enabled_str}
📝 Notes: {notes_truncated}
━━━━━━━━━━━━━━━━━━━━━━━
#backup #{hashtag_hostname} #{hashtag_group} #{hashtag_type} #{hashtag_status} #{hashtag_date}"""

        if len(caption) > 1024:
            caption = caption[:1020] + "..."

        return caption

    def _split_file(
        self,
        data: bytes,
        base_filename: str,
        chunk_size_mb: int
    ) -> list[tuple[bytes, str]]:
        chunk_size = int(chunk_size_mb * 1024 * 1024)
        total_size = len(data)
        num_parts = math.ceil(total_size / chunk_size)

        parts = []
        for i in range(num_parts):
            start = i * chunk_size
            end = min((i + 1) * chunk_size, total_size)
            chunk = data[start:end]

            part_filename = f"{base_filename}.{i+1:03d}"
            parts.append((chunk, part_filename))

        return parts

    def _format_file_size(self, size_bytes: int) -> str:
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"

    def _get_timezone_str(self, timestamp_obj: datetime) -> str:
        utc_str = timestamp_obj.strftime("%Y-%m-%d %H:%M:%S UTC")

        try:
            tz_name = get_settings().TZ if hasattr(get_settings(), 'TZ') else None
            if tz_name:
                local_tz = ZoneInfo(tz_name)
                local_time = timestamp_obj.astimezone(local_tz)
                local_str = local_time.strftime("%Y-%m-%d %H:%M:%S")
                tz_abbr = local_time.strftime("%Z")
                return f"{utc_str}\n   ({local_str} {tz_abbr})"
        except Exception:
            pass

        return utc_str
