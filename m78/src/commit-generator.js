const { callLLM } = require('./llm-client');

const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert'
];

function buildPrompt(diff, config, options = {}) {
  const { commit } = config;
  const typeList = (commit?.types || CONVENTIONAL_TYPES).join('|');
  const maxLength = commit?.maxLength || 72;
  const language = commit?.language || 'zh-CN';
  const { isSummarized = false } = options;

  const languageInstruction = language === 'zh-CN' 
    ? '请使用中文编写 Commit Message'
    : 'Please write Commit Message in English';

  const summarizedNote = isSummarized 
    ? '\n\n注意：代码变更内容已因长度限制进行了摘要/截断处理，请根据提供的变更摘要和样例进行合理推断。'
    : '';

  return `你是一个专业的 Git Commit Message 生成助手。请根据以下代码变更，生成符合 Conventional Commits 规范的 Commit Message。

${languageInstruction}${summarizedNote}

## Conventional Commits 规范:
格式: <type>[optional scope]: <description>

可选类型 (type):
${typeList}

规则:
- type 必须是上述类型之一
- description 简洁明了，不超过 ${maxLength} 个字符
- 使用祈使句语气（如 "add" 而非 "added" 或 "adds"）
- 首字母小写
- 结尾不加句号

## 代码变更:
\`\`\`diff
${diff}
\`\`\`

请直接输出 Commit Message，不要包含任何解释、 markdown 格式或额外内容。只输出最终的 Commit Message 文本。`;
}

function buildPromptWithBody(diff, config, options = {}) {
  const basePrompt = buildPrompt(diff, config, options);
  
  return `${basePrompt}

如果变更较为复杂，请提供详细的提交说明体 (body)，用空行分隔标题和正文。
正文可以包含多行，每行不超过 72 个字符。
只在确实需要详细说明时才添加 body。`;
}

function cleanCommitMessage(message) {
  if (!message) return '';
  
  let cleaned = message.trim();
  
  cleaned = cleaned.replace(/^```[\w]*\n?/g, '').replace(/```$/g, '');
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  cleaned = cleaned.replace(/^\s*Commit Message:\s*/i, '');
  
  return cleaned.trim();
}

function validateCommitMessage(message, config) {
  const errors = [];
  const { commit } = config;
  const types = commit?.types || CONVENTIONAL_TYPES;
  const maxLength = commit?.maxLength || 72;

  if (!message || message.trim().length === 0) {
    errors.push('Commit Message 不能为空');
    return errors;
  }

  const lines = message.split('\n');
  const title = lines[0];

  const typeMatch = title.match(/^(\w+)(\([^)]+\))?:\s*(.+)$/);
  if (!typeMatch) {
    errors.push('格式不符合 Conventional Commits 规范，应为: <type>[scope]: <description>');
    return errors;
  }

  const [, type, , description] = typeMatch;
  
  if (!types.includes(type)) {
    errors.push(`类型 "${type}" 不在允许的类型列表中: ${types.join(', ')}`);
  }

  if (!description || description.trim().length === 0) {
    errors.push('描述 (description) 不能为空');
  }

  if (title.length > maxLength) {
    errors.push(`标题长度超过 ${maxLength} 字符 (当前: ${title.length})`);
  }

  if (lines.length > 1 && lines[1].trim().length !== 0) {
    errors.push('标题和正文之间必须有空行');
  }

  return errors;
}

async function generateCommitMessage(diff, config, options = {}) {
  const { maxRetries = 3, withBody = false, isSummarized = false } = options;
  
  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    attempts++;
    
    try {
      const prompt = withBody 
        ? buildPromptWithBody(diff, config, { isSummarized })
        : buildPrompt(diff, config, { isSummarized });
      const rawResponse = await callLLM(prompt, config);
      const message = cleanCommitMessage(rawResponse);
      
      const errors = validateCommitMessage(message, config);
      
      if (errors.length === 0) {
        return message;
      }
      
      lastError = errors.join('; ');
    } catch (error) {
      lastError = error.message;
    }
  }

  throw new Error(`生成 Commit Message 失败 (已尝试 ${maxRetries} 次): ${lastError}`);
}

module.exports = {
  generateCommitMessage,
  validateCommitMessage,
  cleanCommitMessage,
  CONVENTIONAL_TYPES
};
