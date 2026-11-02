from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.database import Base


class BackupFailure(Base):
    __tablename__ = "backup_failures"

    id = Column(Integer, primary_key=True, index=True)
    backup_id = Column(Integer, ForeignKey("backups.id", ondelete="CASCADE"), nullable=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)

    # Error classification
    error_type = Column(String(50), nullable=False, index=True)  # network_timeout, auth_failure, etc
    error_category = Column(String(20), nullable=False)  # "transient" or "permanent"

    # Retry tracking
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Destination info
    destination_type = Column(String(50), nullable=True)
    destination_name = Column(String(255), nullable=True)

    # Error details
    error_message = Column(Text, nullable=True)
    error_traceback = Column(Text, nullable=True)

    # Diagnostic info
    root_cause_analysis = Column(Text, nullable=True)  # JSON string
    suggested_solution = Column(Text, nullable=True)   # JSON string

    # Auto-fix tracking
    auto_fix_attempted = Column(Boolean, default=False)
    auto_fix_result = Column(Text, nullable=True)

    # Status
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)

    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships
    backup = relationship("Backup", backref="failures")
    device = relationship("Device", backref="backup_failures")

    __table_args__ = (
        Index("ix_backup_failures_device_id_resolved", "device_id", "resolved"),
    )

