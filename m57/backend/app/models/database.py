from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import uuid
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def generate_uuid():
    return str(uuid.uuid4())


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), index=True)
    file_path = Column(String(500))
    type = Column(String(10))
    size = Column(Integer)
    status = Column(String(20), default="uploading")
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id"))
    page_number = Column(Integer)
    content = Column(Text)
    start_index = Column(Integer)
    end_index = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="chunks")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    conversation_id = Column(String(36), ForeignKey("conversations.id"))
    role = Column(String(20))
    content = Column(Text)
    sources = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
