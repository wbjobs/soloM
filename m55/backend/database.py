from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./stegano.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class KeyRecord(Base):
    __tablename__ = "key_records"

    id = Column(Integer, primary_key=True, index=True)
    key_name = Column(String, index=True)
    key_value = Column(String)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used = Column(DateTime, nullable=True)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
