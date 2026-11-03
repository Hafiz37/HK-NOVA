"""Best-effort audit persistence, independent of the caller's unit of work.

Call after committing successful business changes. Failed/denied events should
be recorded after rolling back business changes. This matters for SQLite, which
cannot run an independent audit writer while another writer holds its lock.
Never pass raw request bodies, backup contents, passwords, or key material;
prefer small metadata dictionaries even though field redaction is automatic.
"""
from datetime import datetime, timezone
import json
import logging
import re

from fastapi import Request
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User


logger = logging.getLogger("hk-nova.audit")
REDACTED = "***REDACTED***"


class AuditService:
    @staticmethod
    def redact_sensitive_fields(value):
        """Return a recursively sanitized copy, including dictionaries in lists.

        Match case/separator variants, encrypted fields, and common secret
        aliases. Values under non-sensitive keys must still be safe metadata:
        this deliberately does not guess whether arbitrary prose is a secret.
        """
        if isinstance(value, dict):
            result = {}
            for key, item in value.items():
                normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
                # Only explicitly allowed, strictly boolean metadata may bypass
                # secret-name matching. A string under these names is redacted.
                metadata_flag = normalized in {
                    "haspassword", "hassshkey", "passwordchanged", "passwordupdated",
                }
                if metadata_flag:
                    result[key] = item if type(item) is bool else REDACTED
                    continue
                sensitive = (
                    any(part in normalized for part in (
                        "password", "passwd", "passphrase", "privatekey",
                        "token", "secret", "apikey", "encrypted",
                    ))
                    or normalized in {"authorization", "cookie", "setcookie", "appriseurl", "sshkeypath"}
                )
                result[key] = REDACTED if sensitive else AuditService.redact_sensitive_fields(item)
            return result
        if isinstance(value, (list, tuple)):
            return [AuditService.redact_sensitive_fields(item) for item in value]
        return value

    @staticmethod
    def log(
        db: Session,
        action: str,
        resource_type: str,
        user: User | None = None,
        resource_id: int | None = None,
        resource_name: str | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
        request: Request | None = None,
        status: str = "success",
    ) -> None:
        """Commit an audit entry without committing/rolling back caller changes.

        A separate short-lived session owns the audit transaction. All failures,
        including serialization errors, are contained. Warnings omit exception
        text/tracebacks because SQL errors can embed sensitive bind parameters.
        """
        try:
            # Expired actor attributes may need loading; do not autoflush any
            # pending business objects while resolving the historical identity.
            with db.no_autoflush:
                user_id = user.id if user is not None else None
                username = user.username if user is not None else "system"
            old_json = json.dumps(AuditService.redact_sensitive_fields(old_value), ensure_ascii=False, allow_nan=False) if old_value is not None else None
            new_json = json.dumps(AuditService.redact_sensitive_fields(new_value), ensure_ascii=False, allow_nan=False) if new_value is not None else None

            bind = db.get_bind(mapper=AuditLog)
            engine = bind.engine if isinstance(bind, Connection) else bind
            if engine.dialect.name == "sqlite" and (
                db.in_transaction() or isinstance(bind, Connection) and bind.in_transaction()
            ):
                # Besides avoiding writer-lock waits, this protects sessions
                # using StaticPool/SingletonThreadPool: their "independent"
                # connections can share the caller's actual DBAPI transaction.
                connection = bind if isinstance(bind, Connection) else db.connection(bind_arguments={"mapper": AuditLog})
                if connection.connection.dbapi_connection.in_transaction:
                    logger.warning("Audit entry skipped: call after the SQLite business transaction ends")
                    return

            entry = AuditLog(
                timestamp=datetime.now(timezone.utc),
                user_id=user_id,
                username=username,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                old_value=old_json,
                new_value=new_json,
                ip_address=request.client.host if request is not None and request.client is not None else None,
                user_agent=request.headers.get("User-Agent") if request is not None else None,
                status=status,
            )
            with Session(bind=engine) as audit_db:
                audit_db.add(entry)
                audit_db.commit()
        except Exception as exc:
            logger.warning("Audit entry could not be recorded (%s)", type(exc).__name__)
