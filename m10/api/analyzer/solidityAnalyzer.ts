import type { AnalyzeIssue, AnalyzeResponse } from '../../shared/types';
import { validateSandboxInput, getCompileTimeout, getAnalysisTimeout, createTimeoutPromise } from './sandboxSecurity.js';
import { generateCallGraph } from './callGraph.js';
import solc from 'solc';

interface RuleCheck {
  id: string;
  severity: 'error' | 'warning' | 'info' | 'optimization';
  check: (lines: string[], code: string) => AnalyzeIssue[];
}

const rules: RuleCheck[] = [
  {
    id: 'REENTRANCY',
    severity: 'error',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if (line.includes('.call{value:') || line.includes('.call.value(')) {
          if (!line.includes('reentrancy') && !line.includes('ReentrancyGuard')) {
            issues.push({
              severity: 'error',
              line: index + 1,
              column: line.indexOf('.call') + 1,
              message: '潜在的重入攻击漏洞：外部调用前应更新状态或使用 ReentrancyGuard',
              ruleId: 'REENTRANCY',
              suggestion: '使用 Checks-Effects-Interactions 模式，在调用外部合约前更新所有状态变量',
            });
          }
        }
      });
      return issues;
    },
  },
  {
    id: 'UNCHECKED_SEND',
    severity: 'warning',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if ((line.includes('.send(') || line.includes('.transfer(')) && !line.includes('require') && !line.includes('if')) {
          issues.push({
            severity: 'warning',
            line: index + 1,
            column: line.indexOf('.send') !== -1 ? line.indexOf('.send') + 1 : line.indexOf('.transfer') + 1,
            message: '未检查转账返回值：send/transfer 可能失败',
            ruleId: 'UNCHECKED_SEND',
            suggestion: '使用 require(send()) 或检查返回值，考虑使用 call{value:}() 并处理失败情况',
          });
        }
      });
      return issues;
    },
  },
  {
    id: 'TX_ORIGIN',
    severity: 'error',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if (line.includes('tx.origin') && line.includes('require')) {
          issues.push({
            severity: 'error',
            line: index + 1,
            column: line.indexOf('tx.origin') + 1,
            message: '使用 tx.origin 进行身份验证：易受钓鱼攻击',
            ruleId: 'TX_ORIGIN',
            suggestion: '使用 msg.sender 代替 tx.origin 进行身份验证',
          });
        }
      });
      return issues;
    },
  },
  {
    id: 'INTEGER_OVERFLOW',
    severity: 'warning',
    check: (lines, code) => {
      const issues: AnalyzeIssue[] = [];
      if (!code.includes('pragma solidity ^0.8') && !code.includes('pragma solidity >=0.8')) {
        lines.forEach((line, index) => {
          if (line.match(/\w+\s*[\+\-\*\/]\s*\w+/) && !line.includes('SafeMath') && !line.includes('unchecked')) {
            if (line.includes('uint') || line.includes('int')) {
              issues.push({
                severity: 'warning',
                line: index + 1,
                column: 1,
                message: '可能存在整数溢出/下溢风险：Solidity 0.8 之前版本需要显式检查',
                ruleId: 'INTEGER_OVERFLOW',
                suggestion: '升级到 Solidity 0.8+ 或使用 SafeMath 库进行算术运算',
              });
            }
          }
        });
      }
      return issues;
    },
  },
  {
    id: 'DEPRECATED_FUNCTIONS',
    severity: 'warning',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      const deprecated = ['throw', 'msg.gas', 'block.gaslimit'];
      lines.forEach((line, index) => {
        deprecated.forEach((func) => {
          if (line.includes(func)) {
            issues.push({
              severity: 'warning',
              line: index + 1,
              column: line.indexOf(func) + 1,
              message: `使用了已废弃的功能：${func}`,
              ruleId: 'DEPRECATED_FUNCTIONS',
              suggestion: '使用 require/revert 代替 throw，使用 gasleft() 代替 msg.gas',
            });
          }
        });
      });
      return issues;
    },
  },
  {
    id: 'UNPROTECTED_SELFDESTRUCT',
    severity: 'error',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if (line.includes('selfdestruct') || line.includes('suicide')) {
          const funcStart = findFunctionStart(lines, index);
          if (funcStart !== -1) {
            let hasModifier = false;
            for (let i = funcStart; i < index; i++) {
              if (lines[i].includes('onlyOwner') || lines[i].includes('require(msg.sender') || lines[i].includes('modifier')) {
                hasModifier = true;
                break;
              }
            }
            if (!hasModifier) {
              issues.push({
                severity: 'error',
                line: index + 1,
                column: line.indexOf('selfdestruct') !== -1 ? line.indexOf('selfdestruct') + 1 : line.indexOf('suicide') + 1,
                message: '未受保护的自毁函数：任何人都可以销毁合约',
                ruleId: 'UNPROTECTED_SELFDESTRUCT',
                suggestion: '添加 onlyOwner 或其他访问控制修饰符保护 selfdestruct 调用',
              });
            }
          }
        }
      });
      return issues;
    },
  },
  {
    id: 'GAS_OPTIMIZATION',
    severity: 'optimization',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if (line.includes('for') && line.includes('.length')) {
          issues.push({
            severity: 'optimization',
            line: index + 1,
            column: line.indexOf('for') + 1,
            message: '循环中读取数组长度：建议缓存到局部变量',
            ruleId: 'GAS_OPTIMIZATION',
            suggestion: 'uint length = arr.length; for(uint i=0; i<length; i++) 可节省 Gas',
          });
        }
        if (line.match(/storage\s+\w+/)) {
          issues.push({
            severity: 'optimization',
            line: index + 1,
            column: line.indexOf('storage') + 1,
            message: '考虑使用 memory 替代 storage 作为函数参数（除非需要修改状态）',
            ruleId: 'GAS_OPTIMIZATION',
            suggestion: 'memory 访问比 storage 便宜，只读数据使用 memory',
          });
        }
      });
      return issues;
    },
  },
  {
    id: 'MISSING_PARENTHESIS',
    severity: 'info',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if (line.match(/require\s*\(/) && line.match(/require\s*\([^)]*$/)) {
          if (!line.includes('&&') && !line.includes('||')) {
            const match = line.match(/require\s*\(([^,]*)/);
            if (match && !match[1].trim().endsWith(')')) {
              issues.push({
                severity: 'info',
                line: index + 1,
                column: line.indexOf('require') + 1,
                message: 'require 语句缺少错误消息：建议添加便于调试',
                ruleId: 'MISSING_PARENTHESIS',
                suggestion: '使用 require(condition, "error message") 格式',
              });
            }
          }
        }
      });
      return issues;
    },
  },
  {
    id: 'FLOATING_PRAGMA',
    severity: 'warning',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      if (lines[0] && lines[0].includes('pragma solidity') && lines[0].includes('^')) {
        issues.push({
          severity: 'warning',
          line: 1,
          column: lines[0].indexOf('^') + 1,
          message: '浮动的 pragma 版本：建议锁定具体版本',
          ruleId: 'FLOATING_PRAGMA',
          suggestion: '使用 pragma solidity 0.8.20; 替代 pragma solidity ^0.8.0;',
        });
      }
      return issues;
    },
  },
  {
    id: 'UNINITIALIZED_STORAGE',
    severity: 'error',
    check: (lines) => {
      const issues: AnalyzeIssue[] = [];
      lines.forEach((line, index) => {
        if (line.match(/^\s*(uint|int|address|bool|string|bytes|mapping|struct)\s+\w+\s*;/) && !line.includes('=') && !line.includes('constant') && !line.includes('immutable')) {
          if (!line.includes('storage') && !line.includes('memory')) {
            issues.push({
              severity: 'warning',
              line: index + 1,
              column: 1,
              message: '未初始化的状态变量：确保有适当的默认值或在构造函数中初始化',
              ruleId: 'UNINITIALIZED_STORAGE',
              suggestion: '显式初始化状态变量，或在构造函数/初始化函数中赋值',
            });
          }
        }
      });
      return issues;
    },
  },
];

function findFunctionStart(lines: string[], currentLine: number): number {
  for (let i = currentLine; i >= 0; i--) {
    if (lines[i].includes('function ') || lines[i].includes('receive()') || lines[i].includes('fallback()')) {
      return i;
    }
  }
  return -1;
}

const compileWithTimeout = (code: string): Promise<{ output: any; compileTime: number }> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('编译超时：编译时间超过 ' + getCompileTimeout() + 'ms'));
    }, getCompileTimeout());

    try {
      const compileStart = Date.now();
      const input = {
        language: 'Solidity',
        sources: {
          'contract.sol': {
            content: code,
          },
        },
        settings: {
          outputSelection: {
            '*': {
              '*': [],
            },
          },
        },
      };

      const output = JSON.parse(solc.compile(JSON.stringify(input)));
      const compileTime = Date.now() - compileStart;

      clearTimeout(timeout);
      resolve({ output, compileTime });
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
};

export const analyzeSolidity = async (rawCode: string): Promise<AnalyzeResponse> => {
  const validation = validateSandboxInput(rawCode);

  if (!validation.valid) {
    return {
      success: false,
      issues: validation.errors.map((msg, index) => ({
        severity: 'error' as const,
        line: 1,
        column: index + 1,
        message: msg,
        ruleId: 'SANDBOX_VALIDATION',
      })),
      summary: {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        infos: 0,
        optimizations: 0,
      },
      compileTime: 0,
      analysisTime: 0,
    };
  }

  const code = validation.sanitizedCode;
  let compileSuccess = true;
  let compileErrors: AnalyzeIssue[] = [];
  let compileTime = 0;

  try {
    const compileResult = await Promise.race([
      compileWithTimeout(code),
      createTimeoutPromise<{ output: any; compileTime: number }>(
        getCompileTimeout() + 1000,
        '编译超时：操作被强制终止'
      ),
    ]);

    compileTime = compileResult.compileTime;
    const output = compileResult.output;

    if (output.errors) {
      compileErrors = output.errors
        .filter((error: any) => error.severity === 'error')
        .map((error: any) => {
          const match = error.formattedMessage?.match(/(\d+):(\d+)/);
          return {
            severity: 'error' as const,
            line: match ? parseInt(match[1]) : 1,
            column: match ? parseInt(match[2]) : 1,
            message: error.message?.replace(/^.*?:\s*/, '') || 'Unknown compilation error',
            ruleId: 'COMPILE_ERROR',
          };
        });
      if (compileErrors.length > 0) {
        compileSuccess = false;
      }
    }
  } catch (e) {
    compileSuccess = false;
    compileErrors = [{
      severity: 'error',
      line: 1,
      column: 1,
      message: '编译器执行失败：' + (e as Error).message,
      ruleId: 'COMPILER_FAILURE',
    }];
  }

  const analysisStart = Date.now();
  let issues: AnalyzeIssue[] = [...compileErrors, ...validation.securityIssues];

  if (compileSuccess) {
    const lines = code.split('\n');
    for (const rule of rules) {
      try {
        const ruleIssues = rule.check(lines, code);
        issues = [...issues, ...ruleIssues];
      } catch (e) {
        issues.push({
          severity: 'error',
          line: 1,
          column: 1,
          message: `规则 ${rule.id} 执行异常：${(e as Error).message}`,
          ruleId: 'RULE_FAILURE',
        });
      }
    }
  }

  const analysisTime = Date.now() - analysisStart;

  if (analysisTime > getAnalysisTimeout()) {
    issues.push({
      severity: 'warning',
      line: 0,
      column: 0,
      message: '分析时间超过预期，部分规则可能未完成执行',
      ruleId: 'ANALYSIS_TIMEOUT',
    });
  }

  const summary = {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    infos: issues.filter(i => i.severity === 'info').length,
    optimizations: issues.filter(i => i.severity === 'optimization').length,
  };

  let callGraph;
  try {
    callGraph = generateCallGraph(code);
  } catch (e) {
    console.warn('Call graph generation failed:', e);
  }

  return {
    success: compileSuccess,
    issues,
    summary,
    compileTime,
    analysisTime,
    callGraph,
  };
};
