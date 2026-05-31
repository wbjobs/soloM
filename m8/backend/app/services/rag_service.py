from typing import List, Dict, Any, AsyncGenerator, Optional
from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI
from app.core.config import settings
from app.services.vector_store import VectorStoreService
import json
import re


SYSTEM_PROMPT = """你是一个专业的问答助手。请基于提供的上下文信息回答用户的问题。
如果上下文中没有相关信息，请诚实地说你不知道，不要编造答案。
回答时请引用相关的上下文片段，并在引用处标记来源。

上下文信息：
{context}

请用清晰、准确的语言回答问题，并在回答中引用相关的原文片段。
"""


class RAGService:
    def __init__(self, vector_store_service: VectorStoreService):
        self.vector_store_service = vector_store_service
        self.llm = self._get_llm()
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT),
            ("human", "{question}"),
        ])

    def _get_llm(self):
        return ChatOpenAI(
            model_name=settings.OPENAI_MODEL_NAME,
            openai_api_key=settings.OPENAI_API_KEY,
            openai_api_base=settings.OPENAI_API_BASE,
            temperature=0.1,
            streaming=True,
        )

    def _format_context(self, documents: List[Document]) -> str:
        context_parts = []
        for i, doc in enumerate(documents, 1):
            source = doc.metadata.get("file_name", doc.metadata.get("source", "Unknown"))
            page = doc.metadata.get("page", "N/A")
            context_parts.append(
                f"[来源 {i}] 文件: {source}, 页码: {page}\n内容: {doc.page_content}\n"
            )
        return "\n".join(context_parts)

    def _extract_source_info(self, documents: List[Document]) -> List[Dict[str, Any]]:
        sources = []
        for i, doc in enumerate(documents, 1):
            sources.append({
                "id": i,
                "file_name": doc.metadata.get("file_name", doc.metadata.get("source", "Unknown")),
                "page": doc.metadata.get("page"),
                "content": doc.page_content,
                "source": doc.metadata.get("source", ""),
            })
        return sources

    def retrieve_documents(self, query: str, k: int = None) -> List[Document]:
        return self.vector_store_service.similarity_search(query, k=k)

    def query(self, question: str) -> Dict[str, Any]:
        documents = self.retrieve_documents(question)
        context = self._format_context(documents)
        sources = self._extract_source_info(documents)

        chain = (
            {"context": lambda x: context, "question": RunnablePassthrough()}
            | self.prompt
            | self.llm
            | StrOutputParser()
        )

        answer = chain.invoke(question)

        return {
            "answer": answer,
            "sources": sources,
            "question": question,
        }

    async def query_stream(self, question: str) -> AsyncGenerator[str, None]:
        documents = self.retrieve_documents(question)
        context = self._format_context(documents)
        sources = self._extract_source_info(documents)

        sources_data = json.dumps({"type": "sources", "data": sources}, ensure_ascii=False)
        yield f"data: {sources_data}\n\n"

        chain = (
            {"context": lambda x: context, "question": RunnablePassthrough()}
            | self.prompt
            | self.llm
            | StrOutputParser()
        )

        async for chunk in chain.astream(question):
            chunk_data = json.dumps({"type": "content", "data": chunk}, ensure_ascii=False)
            yield f"data: {chunk_data}\n\n"

        yield "data: [DONE]\n\n"

    def simple_rag_chain(self):
        retriever = self.vector_store_service.as_retriever(
            search_kwargs={"k": settings.MAX_RETRIEVED_DOCS}
        )

        def format_docs(docs):
            return "\n\n".join(doc.page_content for doc in docs)

        rag_prompt = ChatPromptTemplate.from_template("""
请基于以下上下文回答问题：

上下文: {context}

问题: {question}

请给出详细的回答。
        """)

        chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | rag_prompt
            | self.llm
            | StrOutputParser()
        )

        return chain

    def highlight_references(self, answer: str, sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        highlighted_sources = []
        for source in sources:
            content = source["content"]
            highlighted_content = content
            highlighted_sources.append({
                **source,
                "highlighted_content": highlighted_content
            })
        
        return {
            "answer": answer,
            "sources": highlighted_sources
        }
