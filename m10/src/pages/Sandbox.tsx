import { useState, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Play, RotateCcw, AlertTriangle, CheckCircle, Info, Zap, AlertCircle, Loader2, ChevronDown, ChevronUp, FileCode, Clock, Timer, GitBranch } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import type { AnalyzeIssue, AnalyzeResponse } from '../../shared/types';
import CallGraph from '@/components/CallGraph';

const defaultContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Invalid address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract VulnerableBank is Ownable {
    mapping(address => uint256) public balances;
    uint256 public totalDeposits;

    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint256 amount);

    function deposit() public payable {
        balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        emit Withdrawal(msg.sender, amount);
    }

    function transfer(address to, uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        require(to != address(0), "Invalid address");
        
        balances[to] += amount;
        balances[msg.sender] -= amount;
        
        emit Transfer(msg.sender, to, amount);
    }

    function getBalance() public view returns (uint256) {
        return balances[msg.sender];
    }

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function emergencyWithdraw() public onlyOwner {
        uint256 amount = address(this).balance;
        payable(owner).transfer(amount);
        emit Withdrawal(owner, amount);
    }

    function destroy() public onlyOwner {
        selfdestruct(payable(owner));
    }
}
`;

const severityConfig = {
  error: {
    label: '错误',
    color: 'text-block-danger',
    bgColor: 'bg-block-danger/10',
    borderColor: 'border-block-danger/30',
    icon: AlertCircle,
  },
  warning: {
    label: '警告',
    color: 'text-block-warning',
    bgColor: 'bg-block-warning/10',
    borderColor: 'border-block-warning/30',
    icon: AlertTriangle,
  },
  info: {
    label: '信息',
    color: 'text-block-info',
    bgColor: 'bg-block-info/10',
    borderColor: 'border-block-info/30',
    icon: Info,
  },
  optimization: {
    label: '优化',
    color: 'text-block-success',
    bgColor: 'bg-block-success/10',
    borderColor: 'border-block-success/30',
    icon: Zap,
  },
};

export default function Sandbox() {
  const [code, setCode] = useState(defaultContract);
  const [activeTab, setActiveTab] = useState<'all' | 'error' | 'warning' | 'info' | 'optimization'>('all');
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [rightPanel, setRightPanel] = useState<'issues' | 'callgraph'>('issues');
  const { analyzeResult, loading, analyzeContract, clearAnalyzeResult } = useBlockStore();
  const editorRef = useRef<any>(null);

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;
  }, []);

  const handleAnalyze = () => {
    analyzeContract(code);
  };

  const handleReset = () => {
    setCode(defaultContract);
    clearAnalyzeResult();
  };

  const toggleIssue = (id: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredIssues = analyzeResult?.issues.filter(issue => {
    if (activeTab === 'all') return true;
    return issue.severity === activeTab;
  }) || [];

  const tabs = [
    { key: 'all', label: '全部', count: analyzeResult?.issues.length || 0 },
    { key: 'error', label: '错误', count: analyzeResult?.summary.errors || 0, color: 'text-block-danger' },
    { key: 'warning', label: '警告', count: analyzeResult?.summary.warnings || 0, color: 'text-block-warning' },
    { key: 'info', label: '信息', count: analyzeResult?.summary.infos || 0, color: 'text-block-info' },
    { key: 'optimization', label: '优化', count: analyzeResult?.summary.optimizations || 0, color: 'text-block-success' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-block-text">合约分析沙箱</h1>
          <p className="text-block-text-muted mt-1">提交 Solidity 代码进行静态安全分析</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {loading ? '分析中...' : '开始分析'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card overflow-hidden flex flex-col h-[600px]">
          <div className="p-3 border-b border-block-border flex items-center gap-2 bg-block-bg/50">
            <FileCode className="w-4 h-4 text-block-accent" />
            <span className="text-sm font-medium text-block-text">solidity</span>
            <span className="text-xs text-block-text-muted ml-2">Solidity 合约代码</span>
          </div>
          <Editor
            height="100%"
            defaultLanguage="solidity"
            value={code}
            onChange={(value) => setCode(value || '')}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>

        <div className="glass-card overflow-hidden flex flex-col h-[600px]">
          <div className="p-3 border-b border-block-border flex items-center justify-between bg-block-bg/50">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-block-accent" />
              <span className="text-sm font-medium text-block-text">分析结果</span>
            </div>
            {analyzeResult && (
              <div className="flex items-center gap-3 text-xs text-block-text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  编译: {analyzeResult.compileTime}ms
                </span>
                <span className="flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  分析: {analyzeResult.analysisTime}ms
                </span>
              </div>
            )}
          </div>

          {analyzeResult && (
            <div className="flex border-b border-block-border">
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                  rightPanel === 'issues'
                    ? 'border-block-accent text-block-accent'
                    : 'border-transparent text-block-text-muted hover:text-block-text'
                }`}
                onClick={() => setRightPanel('issues')}
              >
                <Code2 className="w-3.5 h-3.5" />
                问题列表
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                  rightPanel === 'callgraph'
                    ? 'border-block-accent text-block-accent'
                    : 'border-transparent text-block-text-muted hover:text-block-text'
                }`}
                onClick={() => setRightPanel('callgraph')}
              >
                <GitBranch className="w-3.5 h-3.5" />
                调用图
              </button>
            </div>
          )}

          {rightPanel === 'issues' && (
            <>
              {analyzeResult && (
                <div className="p-3 border-b border-block-border">
                  <div className={`p-3 rounded-lg mb-3 ${
                    analyzeResult.success
                      ? 'bg-block-success/10 border border-block-success/30'
                      : 'bg-block-danger/10 border border-block-danger/30'
                  }`}>
                    <div className="flex items-center gap-2">
                      {analyzeResult.success ? (
                        <CheckCircle className="w-5 h-5 text-block-success" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-block-danger" />
                      )}
                      <span className={`font-medium ${
                        analyzeResult.success ? 'text-block-success' : 'text-block-danger'
                      }`}>
                        {analyzeResult.success ? '编译成功' : '编译失败'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {tabs.filter(t => t.key !== 'all').map(tab => (
                      <div key={tab.key} className="text-center p-2 rounded-lg bg-block-bg/30">
                        <p className={`text-xl font-bold ${tab.color}`}>{tab.count}</p>
                        <p className="text-xs text-block-text-muted">{tab.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analyzeResult && (
                <div className="flex border-b border-block-border">
                  {tabs.map(tab => (
                    <button
                      key={tab.key}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                        activeTab === tab.key
                          ? 'border-block-accent text-block-accent'
                          : 'border-transparent text-block-text-muted hover:text-block-text'
                      }`}
                      onClick={() => setActiveTab(tab.key as any)}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {!analyzeResult && !loading && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <Code2 className="w-12 h-12 text-block-border mb-4" />
                    <p className="text-block-text-muted text-sm">
                      编写或粘贴 Solidity 合约代码，点击"开始分析"进行静态安全检测
                    </p>
                  </div>
                )}

                {loading && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <Loader2 className="w-10 h-10 text-block-accent animate-spin mb-4" />
                    <p className="text-block-text-muted text-sm">正在分析合约代码...</p>
                  </div>
                )}

                {analyzeResult && filteredIssues.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <CheckCircle className="w-12 h-12 text-block-success mb-4" />
                    <p className="text-block-text font-medium">未发现该类型问题</p>
                    <p className="text-block-text-muted text-sm mt-1">干得漂亮！</p>
                  </div>
                )}

                {analyzeResult && filteredIssues.length > 0 && (
                  <div className="divide-y divide-block-border/50">
                    {filteredIssues.map((issue: AnalyzeIssue, index: number) => {
                      const config = severityConfig[issue.severity];
                      const issueId = `${issue.ruleId}-${index}`;
                      const isExpanded = expandedIssues.has(issueId);
                      const Icon = config.icon;

                      return (
                        <div
                          key={issueId}
                          className={`p-4 ${config.bgColor} border-l-2 ${config.borderColor} animate-slide-in`}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <div
                            className="flex items-start gap-3 cursor-pointer"
                            onClick={() => toggleIssue(issueId)}
                          >
                            <Icon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-medium ${config.color} px-2 py-0.5 rounded ${config.bgColor}`}>
                                  {config.label}
                                </span>
                                <span className="text-xs text-block-text-muted font-mono">
                                  Ln {issue.line}, Col {issue.column}
                                </span>
                              </div>
                              <p className="text-sm text-block-text mt-1.5">{issue.message}</p>
                              <p className="text-xs text-block-text-muted mt-1 font-mono">
                                规则: {issue.ruleId}
                              </p>
                              {isExpanded && issue.suggestion && (
                                <div className="mt-3 p-3 bg-block-bg/50 rounded-lg">
                                  <p className="text-xs text-block-text-muted mb-1">修复建议:</p>
                                  <p className="text-sm text-block-text">{issue.suggestion}</p>
                                </div>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-block-text-muted flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-block-text-muted flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {rightPanel === 'callgraph' && (
            <div className="flex-1 overflow-hidden">
              {!analyzeResult && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <GitBranch className="w-12 h-12 text-block-border mb-4" />
                  <p className="text-block-text-muted text-sm">
                    点击"开始分析"以生成函数调用图
                  </p>
                </div>
              )}
              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <Loader2 className="w-10 h-10 text-block-accent animate-spin mb-4" />
                  <p className="text-block-text-muted text-sm">正在生成调用图...</p>
                </div>
              )}
              {analyzeResult && analyzeResult.callGraph && (
                <CallGraph data={analyzeResult.callGraph} />
              )}
              {analyzeResult && !analyzeResult.callGraph && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <AlertCircle className="w-12 h-12 text-block-warning mb-4" />
                  <p className="text-block-text font-medium">未能生成调用图</p>
                  <p className="text-block-text-muted text-sm mt-1">请检查合约代码格式是否正确</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-block-text mb-3">支持的检测规则</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: '重入攻击', desc: '检测外部调用前未更新状态的漏洞', severity: 'error' },
            { name: '未检查转账', desc: 'send/transfer 返回值未检查', severity: 'warning' },
            { name: 'tx.origin 认证', desc: '使用 tx.origin 进行身份验证', severity: 'error' },
            { name: '整数溢出', desc: 'Solidity 0.8 之前版本的溢出风险', severity: 'warning' },
            { name: '废弃功能', desc: '使用已废弃的 Solidity 功能', severity: 'warning' },
            { name: '未保护自毁', desc: 'selfdestruct 未受访问控制保护', severity: 'error' },
            { name: 'Gas 优化', desc: '循环中读取数组长度等可优化点', severity: 'optimization' },
            { name: '浮动 Pragma', desc: '建议锁定具体的编译器版本', severity: 'warning' },
            { name: 'require 消息', desc: '建议添加错误消息便于调试', severity: 'info' },
          ].map((rule) => {
            const cfg = severityConfig[rule.severity as keyof typeof severityConfig];
            return (
              <div key={rule.name} className="flex items-start gap-3 p-3 bg-block-bg/30 rounded-lg">
                <cfg.icon className={`w-4 h-4 ${cfg.color} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className="text-sm font-medium text-block-text">{rule.name}</p>
                  <p className="text-xs text-block-text-muted">{rule.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
