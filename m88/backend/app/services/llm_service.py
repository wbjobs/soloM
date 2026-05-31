from loguru import logger
from typing import List, Dict, Any, AsyncGenerator, Optional
import time
import json

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

try:
    from langchain_community.llms import HuggingFacePipeline
    from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline, TextIteratorStreamer
    import torch
    HAS_LOCAL_LLM = True
except ImportError:
    HAS_LOCAL_LLM = False
    logger.warning("Local LLM dependencies not installed")

from ..core.config import settings
from ..schemas import RetrievedChunk


RAG_PROMPT_TEMPLATE = """你是一个专业的知识库问答助手。请根据以下检索到的参考资料来回答用户的问题。
如果参考资料中没有相关信息，请如实告知用户，不要编造答案。

参考资料：
{context}

用户问题：
{question}

请用中文回答："""


class LLMService:
    def __init__(self):
        self.model_path = settings.LLM_MODEL_PATH
        self.device = settings.LLM_DEVICE
        self.max_tokens = settings.LLM_MAX_TOKENS
        self.temperature = settings.LLM_TEMPERATURE
        self.model = None
        self.tokenizer = None
        self.llm_chain = None
        self._load_model()

    def _load_model(self):
        if not HAS_LOCAL_LLM:
            logger.warning("Local LLM dependencies not available, using mock responses")
            self.model = None
            self.tokenizer = None
            return

        try:
            logger.info(f"Loading LLM from {self.model_path} on {self.device}")
            
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_path,
                trust_remote_code=True
            )
            
            if self.device == "cuda":
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_path,
                    torch_dtype=torch.float16,
                    device_map="auto",
                    trust_remote_code=True
                )
            else:
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_path,
                    torch_dtype=torch.float32,
                    trust_remote_code=True
                )
            
            logger.info("LLM loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load LLM: {e}")
            logger.warning("Using mock LLM responses for testing")
            self.model = None
            self.tokenizer = None

    def _format_context(self, sources: List[RetrievedChunk]) -> str:
        context_parts = []
        for i, chunk in enumerate(sources):
            context_parts.append(
                f"[{i+1}] 文档: {chunk.doc_name}\n"
                f"内容: {chunk.content}\n"
            )
        return "\n".join(context_parts)

    def _build_prompt(self, question: str, sources: List[RetrievedChunk]) -> str:
        context = self._format_context(sources)
        return RAG_PROMPT_TEMPLATE.format(context=context, question=question)

    def _mock_generate(self, prompt: str) -> str:
        time.sleep(0.1)
        return "这是一个模拟回复。请配置本地大语言模型以获得真实回答。\n\n已检索到相关文档片段，正在基于知识库内容为您生成答案..."

    async def generate(
        self,
        question: str,
        sources: List[RetrievedChunk],
        stream: bool = False
    ) -> AsyncGenerator[str, None]:
        prompt = self._build_prompt(question, sources)
        
        if self.model is None or self.tokenizer is None:
            if stream:
                response = self._mock_generate(prompt)
                for char in response:
                    yield char
                    time.sleep(0.01)
            else:
                yield self._mock_generate(prompt)
            return

        try:
            if stream:
                streamer = TextIteratorStreamer(
                    self.tokenizer,
                    skip_prompt=True,
                    skip_special_tokens=True
                )
                
                messages = [
                    {"role": "system", "content": "你是一个专业的知识库问答助手。"},
                    {"role": "user", "content": prompt}
                ]
                
                input_ids = self.tokenizer.apply_chat_template(
                    messages,
                    return_tensors="pt",
                    add_generation_prompt=True
                ).to(self.model.device)
                
                generation_kwargs = dict(
                    input_ids=input_ids,
                    streamer=streamer,
                    max_new_tokens=self.max_tokens,
                    temperature=self.temperature,
                    do_sample=True,
                    top_p=0.9
                )
                
                from threading import Thread
                thread = Thread(target=self.model.generate, kwargs=generation_kwargs)
                thread.start()
                
                for new_text in streamer:
                    yield new_text
                
                thread.join()
            else:
                messages = [
                    {"role": "system", "content": "你是一个专业的知识库问答助手。"},
                    {"role": "user", "content": prompt}
                ]
                
                input_ids = self.tokenizer.apply_chat_template(
                    messages,
                    return_tensors="pt",
                    add_generation_prompt=True
                ).to(self.model.device)
                
                with torch.no_grad():
                    outputs = self.model.generate(
                        input_ids,
                        max_new_tokens=self.max_tokens,
                        temperature=self.temperature,
                        do_sample=True,
                        top_p=0.9
                    )
                
                response = self.tokenizer.decode(
                    outputs[0][input_ids.shape[-1]:],
                    skip_special_tokens=True
                )
                yield response
                
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            yield f"生成回答时出错: {str(e)}"

    def is_loaded(self) -> bool:
        return self.model is not None


llm_service = LLMService()
