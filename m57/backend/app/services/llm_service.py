from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from app.core.config import settings
import requests
import json
import logging

logger = logging.getLogger(__name__)


def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


class LLMService:
    def __init__(self):
        self.table_prompt = ChatPromptTemplate.from_template(
            """你是一个专业的数据分析助手。用户提供了一些表格数据和文本内容，请基于这些信息回答问题。

            重要提示：
            1. 表格数据以 Markdown 格式和结构化文本格式提供
            2. 请仔细阅读表格的列名和每一行的数据
            3. 如果表格中没有相关信息，请明确说明"未在表格中找到相关数据"
            4. 回答时请引用具体的表格行和列，例如："根据表格第3行'产品名称'列的数据..."
            5. 对于数值类问题，请准确计算，不要估算
            6. 如果上下文中没有足够信息，请明确告知用户，不要编造答案
            7. 如果是比较类问题，请列出具体的对比数据

            上下文信息（包含表格和文本）:
            {context}

            用户问题:
            {question}

            请用中文，基于上述信息给出准确回答:"""
        )

        self.text_prompt = ChatPromptTemplate.from_template(
            """你是一个专业的文档问答助手。请基于以下上下文信息回答用户的问题。

            重要提示：
            1. 只使用上下文中明确提到的信息，不要编造或推断
            2. 如果上下文中没有相关信息，请明确说明"文档中未提及此问题的相关内容"
            3. 回答时请指明信息来源的页码，例如："根据文档第5页内容..."
            4. 对于列举类问题，请分点列出
            5. 保持回答的准确性和客观性

            上下文:
            {context}

            问题:
            {question}

            请用中文回答:"""
        )

        self.output_parser = StrOutputParser()

    def _get_llm(self):
        from langchain_community.llms import Ollama
        return Ollama(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL,
            temperature=0.1,
            top_p=0.9
        )

    def get_chain(self, retriever):
        rag_chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | self.text_prompt
            | self._get_llm()
            | self.output_parser
        )
        return rag_chain

    def _has_table_content(self, context: str) -> bool:
        table_indicators = ["### 表格", "[表格", "| ", "列名:", "第.*行:"]
        import re
        for indicator in table_indicators:
            if re.search(indicator, context):
                return True
        return False

    def generate_answer(self, context: str, question: str) -> str:
        try:
            llm = self._get_llm()

            if self._has_table_content(context):
                logger.info("Using table-optimized prompt for this query")
                formatted_prompt = self.table_prompt.format(context=context, question=question)
            else:
                logger.info("Using standard text prompt for this query")
                formatted_prompt = self.text_prompt.format(context=context, question=question)

            logger.info(f"Generating answer for question: {question[:50]}...")
            answer = llm.invoke(formatted_prompt)
            logger.info(f"Generated answer length: {len(answer)}")

            return answer
        except Exception as e:
            logger.error(f"Error generating answer: {e}")
            return f"生成回答时出错，请检查 Ollama 服务是否正常运行。错误信息: {str(e)}"

    def get_available_models(self):
        try:
            url = f"{settings.LLM_BASE_URL}/api/tags"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", [])
                return [{"name": model.get("name"), "available": True} for model in models]
        except Exception as e:
            logger.warning(f"Could not fetch models from Ollama: {e}")
        return [{"name": settings.LLM_MODEL, "available": False}]
