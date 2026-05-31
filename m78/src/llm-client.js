const http = require('http');

async function callLLM(prompt, config) {
  const { llm } = config;
  
  switch (llm.provider) {
    case 'ollama':
      return callOllama(prompt, llm);
    case 'openai-compatible':
      return callOpenAICompatible(prompt, llm);
    default:
      throw new Error(`不支持的 LLM provider: ${llm.provider}`);
  }
}

async function callOllama(prompt, llmConfig) {
  const { baseUrl = 'http://localhost:11434', model = 'llama3', options = {} } = llmConfig;
  
  const url = new URL('/api/generate', baseUrl);
  
  const requestBody = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 0.9,
      ...options
    }
  };

  return makeHttpRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  }).then(response => {
    const data = JSON.parse(response);
    return data.response;
  });
}

async function callOpenAICompatible(prompt, llmConfig) {
  const { baseUrl, apiKey = '', model = 'gpt-3.5-turbo', options = {} } = llmConfig;
  
  const url = new URL('/v1/chat/completions', baseUrl);
  
  const requestBody = {
    model,
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: options.temperature ?? 0.7,
    top_p: options.top_p ?? 0.9,
    ...options
  };

  return makeHttpRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  }).then(response => {
    const data = JSON.parse(response);
    return data.choices?.[0]?.message?.content;
  });
}

function makeHttpRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          let errorMessage = `HTTP ${res.statusCode}`;
          try {
            const errorData = JSON.parse(data);
            errorMessage += `: ${errorData.error?.message || data}`;
          } catch {
            errorMessage += `: ${data}`;
          }
          reject(new Error(errorMessage));
        }
      });
    });
    
    req.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        reject(new Error(`无法连接到 LLM 服务 (${options.hostname}:${options.port})，请确保服务已启动`));
      } else {
        reject(new Error(`请求失败: ${error.message}`));
      }
    });
    
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('请求超时 (120秒)'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testConnection(config) {
  const testPrompt = 'Hello, respond with "OK" only.';
  try {
    const response = await callLLM(testPrompt, config);
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  callLLM,
  testConnection
};
