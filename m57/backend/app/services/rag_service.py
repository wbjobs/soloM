from app.services.embedding_service import search_documents, get_vector_store
from app.services.llm_service import LLMService
from app.models.database import Conversation, Message
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import json
from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService()

    def _get_or_create_conversation(self, conversation_id: Optional[str] = None, question: str = ""):
        if conversation_id:
            conversation = self.db.query(Conversation).filter(Conversation.id == conversation_id).first()
            if conversation:
                return conversation

        title = question[:50] + "..." if len(question) > 50 else question
        conversation = Conversation(title=title)
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def _save_message(self, conversation_id: str, role: str, content: str, sources: List = None):
        sources_json = json.dumps(sources) if sources else None
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            sources=sources_json
        )
        self.db.add(message)

        conversation = self.db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conversation:
            conversation.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(message)
        return message

    def _add_citations_to_answer(self, answer: str, sources: List[Dict[str, Any]]) -> str:
        if not sources:
            return answer

        sentences = re.split(r'(?<=[。！？.!?])\s*', answer)
        cited_sentences = []

        for sentence in sentences:
            if not sentence.strip():
                continue

            best_source_idx = -1
            best_match_score = 0

            for i, source in enumerate(sources):
                source_content = source.get("content", "").lower()
                sentence_lower = sentence.lower()

                keywords = re.findall(r'[\w\u4e00-\u9fff]+', sentence_lower)
                if len(keywords) < 2:
                    continue

                match_count = sum(1 for kw in keywords[:10] if len(kw) > 1 and kw in source_content)
                match_score = match_count / len(keywords[:10])

                if match_score > best_match_score and match_score >= 0.2:
                    best_match_score = match_score
                    best_source_idx = i

            if best_source_idx >= 0:
                source = sources[best_source_idx]
                citation_marker = f" [{best_source_idx + 1}]"
                sentence = sentence.rstrip() + citation_marker

            cited_sentences.append(sentence)

        return "".join(cited_sentences)

    def _enhance_source_metadata(self, sources: List[Dict[str, Any]], question: str) -> List[Dict[str, Any]]:
        enhanced_sources = []

        for i, source in enumerate(sources):
            score = source.get("score", 0)
            confidence = max(0, min(1, 1 - score / 2))

            content = source.get("content", "")
            question_lower = question.lower()
            content_lower = content.lower()

            matched_keywords = []
            keywords = re.findall(r'[\w\u4e00-\u9fff]+', question_lower)
            for kw in keywords:
                if len(kw) > 1 and kw in content_lower:
                    matched_keywords.append(kw)

            highlight_spans = []
            for kw in set(matched_keywords):
                start = 0
                while True:
                    idx = content_lower.find(kw, start)
                    if idx == -1:
                        break
                    highlight_spans.append({"start": idx, "end": idx + len(kw), "text": content[idx:idx + len(kw)]})
                    start = idx + len(kw)

            enhanced_source = {
                "id": source.get("id", str(i)),
                "source_id": i + 1,
                "documentName": source.get("document_name", "Unknown"),
                "document_id": source.get("metadata", {}).get("document_id"),
                "pageNumber": source.get("page_number"),
                "chunkIndex": source.get("metadata", {}).get("chunk_index"),
                "content": content,
                "score": score,
                "confidence": round(confidence, 4),
                "relevance": "high" if confidence > 0.7 else "medium" if confidence > 0.5 else "low",
                "is_table": source.get("is_table", False),
                "chunk_type": source.get("chunk_type", "text"),
                "matched_keywords": list(set(matched_keywords)),
                "highlight_spans": highlight_spans[:5],
                "metadata": {
                    "chunk_type": source.get("chunk_type", "text"),
                    "is_table": source.get("is_table", False),
                    "page_number": source.get("page_number"),
                    "document_name": source.get("document_name")
                }
            }
            enhanced_sources.append(enhanced_source)

        return enhanced_sources

    def answer_question(self, question: str, conversation_id: Optional[str] = None, document_ids: Optional[List[str]] = None, k: int = 6, add_citations: bool = True):
        conversation = self._get_or_create_conversation(conversation_id, question)

        self._save_message(conversation.id, "user", question)

        sources = search_documents(question, k=k, document_ids=document_ids)

        enhanced_sources = self._enhance_source_metadata(sources, question)

        if sources:
            context_parts = []

            table_sources = [s for s in sources if s.get("is_table")]
            text_sources = [s for s in sources if not s.get("is_table")]

            if table_sources:
                context_parts.append("=== 表格数据 ===")
                for s in table_sources:
                    page_info = f"第{s['page_number']}页" if s['page_number'] else ""
                    context_parts.append(f"[来源: {s['document_name']} {page_info} - 表格]")
                    context_parts.append(s['content'])
                    context_parts.append("")

            if text_sources:
                context_parts.append("=== 文本内容 ===")
                for s in text_sources:
                    page_info = f"第{s['page_number']}页" if s['page_number'] else ""
                    context_parts.append(f"[来源: {s['document_name']} {page_info}]")
                    context_parts.append(s['content'])
                    context_parts.append("")

            context = "\n".join(context_parts)

            if len(sources) < 3:
                logger.warning(f"Only {len(sources)} sources found for question, answer may be incomplete")
        else:
            context = "未在文档中找到与问题相关的内容。"
            logger.warning(f"No relevant sources found for question: {question}")

        raw_answer = self.llm_service.generate_answer(context, question)

        if add_citations and enhanced_sources:
            final_answer = self._add_citations_to_answer(raw_answer, enhanced_sources)
        else:
            final_answer = raw_answer

        self._save_message(conversation.id, "assistant", final_answer, enhanced_sources)

        return {
            "answer": final_answer,
            "raw_answer": raw_answer,
            "sources": enhanced_sources,
            "conversation_id": conversation.id,
            "metadata": {
                "total_sources": len(enhanced_sources),
                "has_tables": any(s.get("is_table") for s in enhanced_sources),
                "avg_confidence": round(sum(s.get("confidence", 0) for s in enhanced_sources) / len(enhanced_sources), 4) if enhanced_sources else 0
            }
        }

    def get_conversation_history(self, conversation_id: str):
        conversation = self.db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            return None

        messages = self.db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at).all()

        formatted_messages = []
        for msg in messages:
            sources = None
            if msg.sources:
                try:
                    sources = json.loads(msg.sources)
                except Exception:
                    sources = None

            formatted_messages.append({
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "sources": sources,
                "created_at": msg.created_at
            })

        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
            "messages": formatted_messages
        }

    def get_all_conversations(self):
        conversations = self.db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
        return [{
            "id": conv.id,
            "title": conv.title,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at
        } for conv in conversations]
