from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
import re


class LocationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    notes: Optional[str] = None
    enabled: bool = True


class LocationCreate(LocationBase):
    telegram_chat_id: str = Field(..., description="Telegram chat ID for this location")
    telegram_bot_token: Optional[str] = None
    
    @field_validator('telegram_chat_id')
    @classmethod
    def validate_chat_id(cls, v: str) -> str:
        pattern = r'^-\d{10,}$'
        if not re.match(pattern, v):
            raise ValueError('Chat ID harus berformat: -1001234567890 (negative number dengan minimal 10 digit)')
        return v


class LocationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    notes: Optional[str] = None
    enabled: Optional[bool] = None
    telegram_chat_id: Optional[str] = None
    
    @field_validator('telegram_chat_id')
    @classmethod
    def validate_chat_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        pattern = r'^-\d{10,}$'
        if not re.match(pattern, v):
            raise ValueError('Chat ID harus berformat: -1001234567890 (negative number dengan minimal 10 digit)')
        return v


class LocationRead(LocationBase):
    id: int
    telegram_destination_id: Optional[int] = None
    group_id: Optional[int] = None
    device_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    # Nested info (populated manually in API)
    telegram_channel_name: Optional[str] = None
    group_name: Optional[str] = None
    
    class Config:
        from_attributes = True
