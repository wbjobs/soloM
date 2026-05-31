import type { AnalyzeIssue } from '../../shared/types';

const MAX_CODE_LENGTH = 32000;
const MAX_LINES = 500;
const MAX_IMPORTS = 5;
const COMPILE_TIMEOUT_MS = 15000;
const ANALYSIS_TIMEOUT_MS = 10000;

const DANGEROUS_PATTERNS: Array<{
  pattern: RegExp;
  ruleId: string;
  message: string;
  severity: 'error' | 'warning';
}> = [
  {
    pattern: /import\s+.*["']https?:\/\//gi,
    ruleId: 'INSECURE_IMPORT',
    message: '检测到外部 URL 导入：可能导致远程代码执行，仅允许本地导入',
    severity: 'error',
  },
  {
    pattern: /assembly\s*\{/gi,
    ruleId: 'INLINE_ASSEMBLY',
    message: '检测到内联汇编代码：汇编可以绕过 Solidity 安全检查，存在潜在危险',
    severity: 'warning',
  },
  {
    pattern: /\.call\s*\(\s*[^)]*\)/gi,
    ruleId: 'LOW_LEVEL_CALL',
    message: '检测到低级别 call 调用：可能执行任意合约代码',
    severity: 'warning',
  },
  {
    pattern: /delegatecall/gi,
    ruleId: 'DELEGATECALL',
    message: '检测到 delegatecall：在另一个合约的上下文中执行代码，极度危险',
    severity: 'error',
  },
  {
    pattern: /selfdestruct|suicide/gi,
    ruleId: 'SELFDESTRUCT',
    message: '检测到自毁操作：可能导致合约资金丢失',
    severity: 'warning',
  },
  {
    pattern: /ecrecover/gi,
    ruleId: 'ECRECOVER',
    message: '检测到 ecrecover：签名重放攻击风险，建议使用 OpenZeppelin 的 ECDSA 库',
    severity: 'warning',
  },
  {
    pattern: /block\.timestamp|now\b/gi,
    ruleId: 'TIMESTAMP_DEPENDENCY',
    message: '检测到区块时间戳依赖：矿工可操控时间戳，不适合作为随机数种子',
    severity: 'warning',
  },
  {
    pattern: /block\.difficulty|blockhash/gi,
    ruleId: 'BLOCK_VARIABLE_DEPENDENCY',
    message: '检测到区块变量依赖：区块变量可被矿工影响，不适合用于随机性',
    severity: 'warning',
  },
];

const FORBIDDEN_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /(?:^|\n)\s*(?:const|let|var)?\s*\w*\s*(?:exec|eval)\s*\(|child_process|require\s*\(\s*['"]fs['"]|require\s*\(\s*['"]child_process['"]|require\s*\(\s*['"]net['"]|require\s*\(\s*['"]http['"]|process\.(?:env|exit|cwd|chdir|kill|pid|hrtime|memoryUsage|nextTick)|new\s+Function\s*\(/gi,
    reason: '代码包含潜在的 Node.js 系统调用模式',
  },
  {
    pattern: /\\x[0-9a-fA-F]{2}(?![0-9a-fA-F])|\\u\{[0-9a-fA-F]{4,}\}|\\[0-7]{3}(?=[^0-7])/g,
    reason: '代码包含可疑转义序列，可能用于注入攻击',
  },
  {
    pattern: /__proto__|constructor\s*\[|prototype\s*\[/gi,
    reason: '代码包含原型污染攻击模式',
  },
];

export interface SandboxValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: AnalyzeIssue[];
  sanitizedCode: string;
}

export const validateSandboxInput = (code: string): SandboxValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const securityIssues: AnalyzeIssue[] = [];

  if (!code || typeof code !== 'string') {
    errors.push('代码不能为空且必须为字符串');
    return { valid: false, errors, warnings, securityIssues, sanitizedCode: '' };
  }

  if (code.length > MAX_CODE_LENGTH) {
    errors.push(`代码长度超过限制：最大 ${MAX_CODE_LENGTH} 字符，当前 ${code.length} 字符`);
  }

  const lines = code.split('\n');
  if (lines.length > MAX_LINES) {
    errors.push(`代码行数超过限制：最大 ${MAX_LINES} 行，当前 ${lines.length} 行`);
  }

  if (!code.includes('pragma solidity')) {
    errors.push('代码必须包含 pragma solidity 声明');
  }

  const pragmaMatch = code.match(/pragma solidity\s+([^;]+);/);
  if (pragmaMatch) {
    const version = pragmaMatch[1].trim();
    if (version.includes('<') && !version.includes('>=')) {
      warnings.push(`编译器版本 ${version} 可能过旧，建议使用 0.8.x 或更高版本`);
    }
  }

  const importCount = (code.match(/^import\s/gm) || []).length;
  if (importCount > MAX_IMPORTS) {
    errors.push(`导入数量超过限制：最大 ${MAX_IMPORTS} 个，当前 ${importCount} 个`);
  }

  for (const forbidden of FORBIDDEN_PATTERNS) {
    const match = code.match(forbidden.pattern);
    if (match) {
      errors.push(`安全拒绝：${forbidden.reason}`);
    }
  }

  lines.forEach((line, index) => {
    for (const dangerous of DANGEROUS_PATTERNS) {
      const pattern = new RegExp(dangerous.pattern.source, dangerous.pattern.flags);
      if (pattern.test(line)) {
        securityIssues.push({
          severity: dangerous.severity,
          line: index + 1,
          column: 1,
          message: dangerous.message,
          ruleId: dangerous.ruleId,
          suggestion: '请确认此操作是否必要，并确保添加了适当的安全保护',
        });
      }
    }
  });

  const contractCount = (code.match(/\bcontract\s+\w+/g) || []).length;
  if (contractCount > 3) {
    warnings.push(`合约数量较多（${contractCount} 个），建议限制在 3 个以内以保证分析质量`);
  }

  const sanitizedCode = code
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    securityIssues,
    sanitizedCode,
  };
};

export const getCompileTimeout = (): number => COMPILE_TIMEOUT_MS;
export const getAnalysisTimeout = (): number => ANALYSIS_TIMEOUT_MS;

export const createTimeoutPromise = <T>(ms: number, message: string): Promise<T> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};
