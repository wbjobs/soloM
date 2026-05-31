export interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: number;
  miner: string;
  difficulty: string;
  size: number;
  gasUsed: string;
  gasLimit: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  gasUsed: number;
  blockHeight: number;
  timestamp: number;
}

export interface GasRankingItem {
  rank: number;
  hash: string;
  gasUsed: number;
  gasPrice: string;
  fee: string;
  from: string;
  to: string;
  timestamp: number;
}

export interface AnalyzeRequest {
  code: string;
  version?: string;
}

export interface AnalyzeIssue {
  severity: 'error' | 'warning' | 'info' | 'optimization';
  line: number;
  column: number;
  message: string;
  ruleId: string;
  suggestion?: string;
}

export interface CallGraphNode {
  id: string;
  label: string;
  type: 'function' | 'modifier' | 'event' | 'fallback' | 'receive' | 'constructor' | 'external';
  contract: string;
  visibility: 'external' | 'public' | 'internal' | 'private';
  line: number;
  isPayable?: boolean;
  isView?: boolean;
  isPure?: boolean;
}

export interface CallGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'call' | 'delegatecall' | 'staticcall' | 'send' | 'transfer' | 'emit' | 'modifier' | 'inheritance';
  line: number;
}

export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  contracts: string[];
  entryPoints: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  issues: AnalyzeIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    optimizations: number;
  };
  compileTime: number;
  analysisTime: number;
  callGraph?: CallGraph;
}

export interface BlockDetail extends Block {
  transactionList: Transaction[];
}
