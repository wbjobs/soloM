import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { preprocessErrorsForLLM, formatErrorsForLLM, estimateTokens } from './logParser.js';

const MODEL_TOKEN_LIMITS = [
  { pattern: 'gpt-4o-mini', limit: 128000 },
  { pattern: 'gpt-4o', limit: 128000 },
  { pattern: 'gpt-4-', limit: 8192 },
  { pattern: 'gpt-4', limit: 8192 },
  { pattern: 'gpt-3.5-turbo-16k', limit: 16385 },
  { pattern: 'gpt-3.5-turbo', limit: 16385 },
  { pattern: 'claude-3-opus', limit: 200000 },
  { pattern: 'claude-3-sonnet', limit: 200000 },
  { pattern: 'claude-3-haiku', limit: 200000 },
  { pattern: 'qwen2.5:32b', limit: 32768 },
  { pattern: 'qwen2.5:14b', limit: 32768 },
  { pattern: 'qwen2.5:7b', limit: 32768 },
  { pattern: 'llama3:70b', limit: 8192 },
  { pattern: 'llama3:8b', limit: 8192 },
  { pattern: 'gemma:7b', limit: 8192 },
  { pattern: 'mistral:7b', limit: 32768 }
];

const DEFAULT_TOKEN_LIMIT = 8000;

export function getModelTokenLimit(modelName) {
  if (!modelName) return DEFAULT_TOKEN_LIMIT;
  
  const lowerModel = modelName.toLowerCase();
  for (const { pattern, limit } of MODEL_TOKEN_LIMITS) {
    if (lowerModel.includes(pattern)) {
      return limit;
    }
  }
  return DEFAULT_TOKEN_LIMIT;
}

const SYSTEM_PROMPT = `你是一位专业的日志分析专家。请分析以下错误日志，找出可能的根本原因，并提供具体的排查步骤。

请严格按照以下格式输出：

## 可能的原因
1. [原因1]
2. [原因2]
...

## 建议排查步骤
1. [步骤1]
2. [步骤2]
...

## 简要总结
[不超过3句话的总结]

要求：
- 只基于提供的日志内容进行分析，不要编造信息
- 原因分析要深入，指出可能的技术根源
- 排查步骤要具体、可操作
- 如果日志信息不足，请明确指出需要补充什么信息
- 注意：部分日志可能已被截断或合并以适应长度限制，请在分析时考虑这一点`;

export function createLLM(provider, options = {}) {
  switch (provider.toLowerCase()) {
    case 'openai':
      return createOpenAILLM(options);
    case 'ollama':
      return createOllamaLLM(options);
    default:
      throw new Error(`Unsupported provider: ${provider}. Use 'openai' or 'ollama'`);
  }
}

function createOpenAILLM(options = {}) {
  const config = {
    apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    model: options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: options.temperature ?? 0.1,
  };

  if (options.baseUrl || process.env.OPENAI_BASE_URL) {
    config.configuration = {
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL
    };
  }

  if (!config.apiKey) {
    throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass --api-key');
  }

  return {
    llm: new ChatOpenAI(config),
    modelName: config.model,
    provider: 'openai'
  };
}

function createOllamaLLM(options = {}) {
  const config = {
    baseUrl: options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: options.model || process.env.OLLAMA_MODEL || 'qwen2.5:7b',
    temperature: options.temperature ?? 0.1,
  };

  return {
    llm: new ChatOllama(config),
    modelName: config.model,
    provider: 'ollama'
  };
}

export async function analyzeErrors(llmWrapper, rawErrors, preprocessOptions = {}, signal) {
  const { llm, modelName } = llmWrapper;
  
  const tokenLimit = getModelTokenLimit(modelName);
  
  const preprocessResult = preprocessErrorsForLLM(rawErrors, {
    maxTokens: tokenLimit,
    ...preprocessOptions
  });

  if (preprocessResult.warnings.length > 0) {
    preprocessResult.warnings.forEach(warning => {
      console.warn(`  ⚠️  ${warning}`);
    });
  }

  const formattedErrors = formatErrorsForLLM(preprocessResult.errors);

  const systemPromptTokens = estimateTokens(SYSTEM_PROMPT);
  const userPromptTemplate = `以下是最近的错误日志：

${formattedErrors}

请分析这些错误日志，按照要求的格式输出分析结果。`;
  
  const userPromptTokens = estimateTokens(userPromptTemplate);
  const totalTokens = systemPromptTokens + userPromptTokens;

  console.log(`  📊 Token usage: ${totalTokens}/${tokenLimit} (${Math.round(totalTokens / tokenLimit * 100)}%)`);

  if (totalTokens > tokenLimit * 0.95) {
    console.warn(`  ⚠️  Warning: Token usage is very high (${Math.round(totalTokens / tokenLimit * 100)}%)`);
  }

  const userPrompt = userPromptTemplate;

  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt)
  ];

  const outputParser = new StringOutputParser();
  const chain = llm.pipe(outputParser);
  
  return {
    analysis: await chain.invoke(messages, { signal }),
    preprocessInfo: preprocessResult
  };
}

export async function testConnection(llmWrapper) {
  try {
    const { llm } = llmWrapper;
    const messages = [
      new SystemMessage('You are a helpful assistant.'),
      new HumanMessage('Please respond with "OK" if you can read this message.')
    ];
    const outputParser = new StringOutputParser();
    const chain = llm.pipe(outputParser);
    const result = await chain.invoke(messages);
    return result.trim().toUpperCase().includes('OK');
  } catch (error) {
    return false;
  }
}

export class ChatSession {
  constructor(llmWrapper, formattedErrors) {
    this.llm = llmWrapper.llm;
    this.modelName = llmWrapper.modelName;
    this.tokenLimit = getModelTokenLimit(llmWrapper.modelName);
    this.history = [];
    this.formattedErrors = formattedErrors;
    this.maxHistoryTurns = 10;
    this.systemPrompt = SYSTEM_PROMPT + `

你现在正在与用户进行持续对话。用户可能会基于你之前的分析结果提出进一步的问题。
请记住之前的分析内容，对用户的追问给出连贯、具体的回答。
如果用户要求更详细的排查步骤、代码示例或修复建议，请尽量给出可操作的具体内容。`;
  }

  _buildMessages() {
    const messages = [new SystemMessage(this.systemPrompt)];

    const contextMessage = new HumanMessage(`以下是待分析的错误日志：

${this.formattedErrors}

请先分析这些错误日志，按照要求的格式输出分析结果。`);
    messages.push(contextMessage);

    const historyStart = Math.max(0, this.history.length - this.maxHistoryTurns * 2);
    const recentHistory = this.history.slice(historyStart);

    for (const msg of recentHistory) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      }
    }

    return messages;
  }

  _estimateHistoryTokens() {
    const messages = this._buildMessages();
    let total = 0;
    for (const msg of messages) {
      total += estimateTokens(msg.content);
    }
    return total;
  }

  _trimHistory() {
    while (this.history.length > 0) {
      const currentTokens = this._estimateHistoryTokens();
      if (currentTokens <= this.tokenLimit * 0.7) {
        break;
      }
      this.history.shift();
      if (this.history.length > 0 && this.history[0].role === 'assistant') {
        this.history.shift();
      }
    }
  }

  async chat(userInput) {
    this.history.push({ role: 'user', content: userInput });

    this._trimHistory();

    const messages = this._buildMessages();
    const outputParser = new StringOutputParser();
    const chain = this.llm.pipe(outputParser);

    const response = await chain.invoke(messages);

    this.history.push({ role: 'assistant', content: response });

    return response;
  }

  getHistoryLength() {
    return this.history.length;
  }
}

export default {
  createLLM,
  analyzeErrors,
  testConnection,
  getModelTokenLimit,
  MODEL_TOKEN_LIMITS,
  DEFAULT_TOKEN_LIMIT,
  ChatSession
};
