from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class Source(BaseModel):
    id: str
    document_name: str
    page_number: Optional[int] = None
    content: str
    score: float


class ChatRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None
    document_ids: Optional[List[str]] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    conversation_id: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sources: Optional[List[Source]] = None
    created_at: datetime


class ConversationResponse(BaseModel):
    id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: Optional[List[MessageResponse]] = None


class ModelInfo(BaseModel):
    name: str
    available: bool
