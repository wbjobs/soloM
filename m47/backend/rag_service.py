import logging
from typing import List, Dict, Any, Optional, AsyncIterator
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from .config import settings
from .vector_store import VectorStoreManager

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """你是一个专业的代码库智能问答助手。你的任务是基于提供的代码上下文，准确、详细地回答用户关于代码的问题。

请遵循以下规则：
1. 仅使用提供的代码上下文信息来回答问题。如果上下文中没有相关信息，请明确说明。
2. 当引用代码时，使用代码格式块展示关键代码片段。
3. 在回答的末尾，列出你引用的所有代码文件路径和行号范围。
4. 如果用户询问代码的功能、实现逻辑或架构，请提供清晰的解释。
5. 如果发现代码中可能存在的问题或改进点，可以在回答中提出建议。
6. 回答要专业、准确、有条理。

代码上下文将按以下格式提供：
---
[文件路径] (行号范围) [类型: 名称]
代码内容
---
"""


class RAGService:
    def __init__(self, vector_store_manager: VectorStoreManager):
        self.vector_store_manager = vector_store_manager
        self._chat_model = None
        self._initialize_chat_model()

    def _initialize_chat_model(self) -> None:
        provider = settings.llm_provider.lower()

        if provider == "ollama":
            self._init_ollama_model()
        elif provider == "openai":
            self._init_openai_model()
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")

        logger.info(f"Initialized {provider} chat model")

    def _init_ollama_model(self) -> None:
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            from langchain_community.chat_models import ChatOllama

        self._chat_model = ChatOllama(
            base_url=settings.ollama_base_url,
            model=settings.ollama_chat_model,
            temperature=0.1,
            streaming=True,
        )

    def _init_openai_model(self) -> None:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            from langchain_community.chat_models import ChatOpenAI

        self._chat_model = ChatOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            model=settings.openai_chat_model,
            temperature=0.1,
            streaming=True,
        )

    def retrieve_context(self, query: str, k: Optional[int] = None) -> List[Document]:
        k = k or settings.top_k_retrieve
        logger.info(f"Retrieving context for query: {query[:50]}...")

        retrieved_docs = self.vector_store_manager.similarity_search(
            query=query,
            k=k,
        )

        logger.info(f"Retrieved {len(retrieved_docs)} documents")
        return retrieved_docs

    def _format_context(self, documents: List[Document]) -> str:
        context_parts = []

        for i, doc in enumerate(documents, 1):
            metadata = doc.metadata
            file_path = metadata.get("file_path", "unknown")
            start_line = metadata.get("start_line", "?")
            end_line = metadata.get("end_line", "?")
            chunk_type = metadata.get("chunk_type", "unknown")
            name = metadata.get("name", "")
            score = metadata.get("similarity_score", 0.0)

            header = f"[{i}] {file_path} (Lines: {start_line}-{end_line}) [Type: {chunk_type}"
            if name:
                header += f", Name: {name}"
            header += f"] [Score: {score:.4f}]"

            content = doc.page_content.split('\n', 1)[1] if '\n' in doc.page_content else doc.page_content
            context_parts.append(f"{header}\n```\n{content}\n```\n")

        return "\n".join(context_parts)

    def _build_messages(self, query: str, context: str, chat_history: Optional[List[Dict[str, str]]] = None) -> List[BaseMessage]:
        messages: List[BaseMessage] = [
            SystemMessage(content=SYSTEM_PROMPT),
        ]

        if chat_history:
            for msg in chat_history:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role == "user":
                    messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    from langchain_core.messages import AIMessage
                    messages.append(AIMessage(content=content))

        user_prompt = f"""请基于以下代码上下文回答我的问题。

代码上下文：
{context}

我的问题：
{query}
"""
        messages.append(HumanMessage(content=user_prompt))
        return messages

    def _extract_references(self, documents: List[Document]) -> List[Dict[str, Any]]:
        references = []
        seen = set()

        for doc in documents:
            metadata = doc.metadata
            file_path = metadata.get("file_path", "unknown")
            start_line = metadata.get("start_line", 0)
            end_line = metadata.get("end_line", 0)
            name = metadata.get("name", "")
            chunk_type = metadata.get("chunk_type", "unknown")
            score = metadata.get("similarity_score", 0.0)

            key = f"{file_path}_{start_line}_{end_line}"
            if key not in seen:
                seen.add(key)
                references.append({
                    "file_path": file_path,
                    "start_line": start_line,
                    "end_line": end_line,
                    "name": name,
                    "type": chunk_type,
                    "score": float(score),
                })

        return sorted(references, key=lambda x: x["score"], reverse=True)

    def ask(self, query: str, chat_history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        if not query.strip():
            return {
                "answer": "请输入有效的问题。",
                "references": [],
                "context": [],
            }

        documents = self.retrieve_context(query)

        if not documents:
            return {
                "answer": "未找到与您的问题相关的代码上下文。请尝试用不同的关键词提问，或确保代码库已正确索引。",
                "references": [],
                "context": [],
            }

        context = self._format_context(documents)
        messages = self._build_messages(query, context, chat_history)

        try:
            response = self._chat_model.invoke(messages)
            answer = response.content
        except Exception as e:
            logger.error(f"Error generating answer: {e}")
            answer = f"生成回答时发生错误：{str(e)}"

        references = self._extract_references(documents)

        return {
            "answer": answer,
            "references": references,
            "context": [
                {
                    "file_path": doc.metadata.get("file_path", ""),
                    "start_line": doc.metadata.get("start_line", 0),
                    "end_line": doc.metadata.get("end_line", 0),
                    "content": doc.page_content,
                    "score": doc.metadata.get("similarity_score", 0.0),
                }
                for doc in documents
            ],
        }

    async def ask_stream(
        self,
        query: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        if not query.strip():
            yield {
                "type": "answer",
                "content": "请输入有效的问题。",
                "done": True,
            }
            return

        documents = self.retrieve_context(query)

        if not documents:
            yield {
                "type": "answer",
                "content": "未找到与您的问题相关的代码上下文。请尝试用不同的关键词提问，或确保代码库已正确索引。",
                "done": True,
            }
            return

        context = self._format_context(documents)
        messages = self._build_messages(query, context, chat_history)
        references = self._extract_references(documents)

        yield {
            "type": "references",
            "content": references,
            "done": False,
        }

        try:
            full_answer = ""
            async for chunk in self._chat_model.astream(messages):
                if hasattr(chunk, 'content') and chunk.content:
                    full_answer += chunk.content
                    yield {
                        "type": "answer_chunk",
                        "content": chunk.content,
                        "done": False,
                    }

            yield {
                "type": "final",
                "content": {
                    "answer": full_answer,
                    "references": references,
                },
                "done": True,
            }
        except Exception as e:
            logger.error(f"Error in streaming answer: {e}")
            yield {
                "type": "error",
                "content": f"生成回答时发生错误：{str(e)}",
                "done": True,
            }
