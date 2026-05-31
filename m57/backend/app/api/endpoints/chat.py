from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.models.database import get_db
from app.schemas.chat import ChatRequest, ChatResponse, ConversationResponse, ModelInfo
from app.services.rag_service import RAGService
from app.services.llm_service import LLMService

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        rag_service = RAGService(db)
        result = rag_service.answer_question(
            question=request.question,
            conversation_id=request.conversation_id,
            document_ids=request.document_ids
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")


@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(db: Session = Depends(get_db)):
    try:
        rag_service = RAGService(db)
        return rag_service.get_all_conversations()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversations: {str(e)}")


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    try:
        rag_service = RAGService(db)
        conversation = rag_service.get_conversation_history(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversation: {str(e)}")


@router.get("/models", response_model=List[ModelInfo])
async def get_models():
    try:
        llm_service = LLMService()
        return llm_service.get_available_models()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching models: {str(e)}")
