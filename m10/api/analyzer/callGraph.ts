import type { CallGraph, CallGraphNode, CallGraphEdge } from '../../shared/types';

const SOLIDITY_BUILTINS = new Set([
  'require', 'revert', 'assert', 'keccak256', 'sha256', 'ripemd160',
  'ecrecover', 'addmod', 'mulmod', 'selfdestruct', 'suicide',
  'abi', 'bytes', 'gasleft', 'blockhash', 'type', 'super', 'this',
]);

interface ParsedFunction {
  name: string;
  contract: string;
  type: CallGraphNode['type'];
  visibility: CallGraphNode['visibility'];
  line: number;
  modifiers: string[];
  body: string;
  isPayable: boolean;
  isView: boolean;
  isPure: boolean;
}

interface ParsedContract {
  name: string;
  line: number;
  inherits: string[];
  functions: Map<string, ParsedFunction>;
  modifiers: Map<string, { name: string; line: number }>;
  events: Map<string, { name: string; line: number }>;
}

const removeComments = (code: string): string => {
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
};

const parseVisibility = (sig: string): CallGraphNode['visibility'] => {
  if (sig.includes('external')) return 'external';
  if (sig.includes('public')) return 'public';
  if (sig.includes('private')) return 'private';
  return 'internal';
};

export const generateCallGraph = (code: string): CallGraph | null => {
  const cleanCode = removeComments(code);
  const contracts: Map<string, ParsedContract> = new Map();
  const nodes: CallGraphNode[] = [];
  const edges: CallGraphEdge[] = [];

  const contractRegex = /\b(?:contract|interface|library)\s+(\w+)(?:\s+is\s+([^{]+?))?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = contractRegex.exec(cleanCode)) !== null) {
    const name = match[1];
    const inheritsStr = match[2] || '';
    const inherits = inheritsStr.split(',').map(s => s.trim()).filter(Boolean);
    const start = match.index + match[0].length - 1;
    const lineNum = (cleanCode.slice(0, match.index).match(/\n/g) || []).length + 1;

    let braceCount = 1;
    let end = start + 1;
    while (braceCount > 0 && end < cleanCode.length) {
      if (cleanCode[end] === '{') braceCount++;
      else if (cleanCode[end] === '}') braceCount--;
      end++;
    }

    const body = cleanCode.slice(start, end);
    const contract: ParsedContract = {
      name,
      line: lineNum,
      inherits,
      functions: new Map(),
      modifiers: new Map(),
      events: new Map(),
    };

    const funcRegex = /\bfunction\s+(\w+|fallback|receive|constructor)\s*\([^)]*\)\s*([^{;]*)/g;
    let fMatch: RegExpExecArray | null;

    while ((fMatch = funcRegex.exec(body)) !== null) {
      const fname = fMatch[1];
      const sig = fMatch[0];
      const absPos = match.index + fMatch.index;
      const fLine = (cleanCode.slice(0, absPos).match(/\n/g) || []).length + 1;
      const ftype: CallGraphNode['type'] = 
        fname === 'fallback' ? 'fallback' :
        fname === 'receive' ? 'receive' :
        fname === 'constructor' ? 'constructor' : 'function';

      let fBodyStart = fMatch.index + fMatch[0].length;
      while (fBodyStart < body.length && body[fBodyStart] !== '{') fBodyStart++;
      let fBrace = 1;
      let fBodyEnd = fBodyStart + 1;
      while (fBrace > 0 && fBodyEnd < body.length) {
        if (body[fBodyEnd] === '{') fBrace++;
        else if (body[fBodyEnd] === '}') fBrace--;
        fBodyEnd++;
      }
      const fBody = body.slice(fBodyStart, fBodyEnd);

      const modMatch = sig.match(/\s+(\w+)(?=\s*\(|;|$)/g) || [];
      const modifiers = modFilter(modMatch);

      contract.functions.set(fname, {
        name: fname,
        contract: name,
        type: ftype,
        visibility: parseVisibility(sig),
        line: fLine,
        modifiers,
        body: fBody,
        isPayable: sig.includes('payable'),
        isView: sig.includes('view'),
        isPure: sig.includes('pure'),
      });
    }

    const modRegex = /\bmodifier\s+(\w+)\s*\(/g;
    let mMatch: RegExpExecArray | null;
    while ((mMatch = modRegex.exec(body)) !== null) {
      const absPos = match.index + mMatch.index;
      contract.modifiers.set(mMatch[1], {
        name: mMatch[1],
        line: (cleanCode.slice(0, absPos).match(/\n/g) || []).length + 1,
      });
    }

    const evRegex = /\bevent\s+(\w+)\s*\(/g;
    let eMatch: RegExpExecArray | null;
    while ((eMatch = evRegex.exec(body)) !== null) {
      const absPos = match.index + eMatch.index;
      contract.events.set(eMatch[1], {
        name: eMatch[1],
        line: (cleanCode.slice(0, absPos).match(/\n/g) || []).length + 1,
      });
    }

    contracts.set(name, contract);
  }

  if (contracts.size === 0) return null;

  for (const [cname, contract] of contracts) {
    for (const [fname, fn] of contract.functions) {
      const nid = `${cname}.${fname}`;
      nodes.push({
        id: nid,
        label: fname,
        type: fn.type,
        contract: cname,
        visibility: fn.visibility,
        line: fn.line,
        isPayable: fn.isPayable,
        isView: fn.isView,
        isPure: fn.isPure,
      });

      for (const modName of fn.modifiers) {
        let modId: string | null = null;
        if (contract.modifiers.has(modName)) {
          modId = `${cname}.${modName}`;
        } else {
          for (const p of contract.inherits) {
            const parent = contracts.get(p);
            if (parent?.modifiers.has(modName)) {
              modId = `${p}.${modName}`;
              break;
            }
          }
        }
        if (modId) {
          if (!nodes.find(n => n.id === modId)) {
            const modInfo = contract.modifiers.get(modName) || 
              contract.inherits.reduce((acc, p) => acc || contracts.get(p)?.modifiers.get(modName), null as any);
            nodes.push({
              id: modId,
              label: modName,
              type: 'modifier',
              contract: cname,
              visibility: 'internal',
              line: modInfo?.line || fn.line,
            });
          }
          edges.push({
            id: `${nid}->mod:${modName}`,
            source: nid,
            target: modId,
            type: 'modifier',
            line: fn.line,
          });
        }
      }
    }

    for (const [ename, einfo] of contract.events) {
      nodes.push({
        id: `${cname}.${ename}`,
        label: ename,
        type: 'event',
        contract: cname,
        visibility: 'external',
        line: einfo.line,
      });
    }

    for (const parent of contract.inherits) {
      const pid = `${parent}.__contract__`;
      const cid = `${cname}.__contract__`;
      if (!nodes.find(n => n.id === pid)) {
        const p = contracts.get(parent);
        nodes.push({
          id: pid,
          label: parent,
          type: 'constructor',
          contract: parent,
          visibility: 'public',
          line: p?.line || 0,
        });
      }
      if (!nodes.find(n => n.id === cid)) {
        nodes.push({
          id: cid,
          label: cname,
          type: 'constructor',
          contract: cname,
          visibility: 'public',
          line: contract.line,
        });
      }
      edges.push({
        id: `inherit:${parent}->${cname}`,
        source: cid,
        target: pid,
        type: 'inheritance',
        line: contract.line,
      });
    }
  }

  for (const [cname, contract] of contracts) {
    for (const [fname, fn] of contract.functions) {
      const sid = `${cname}.${fname}`;
      const lines = fn.body.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const actualLine = fn.line + i;
        const callRe = /(\w+(?:\.\w+)*)\s*\(/g;
        let cm: RegExpExecArray | null;

        while ((cm = callRe.exec(line)) !== null) {
          const expr = cm[1];
          const parts = expr.split('.');

          if (parts.length === 1) {
            const target = parts[0];
            if (SOLIDITY_BUILTINS.has(target)) continue;

            if (contract.functions.has(target)) {
              edges.push({
                id: `${sid}->${cname}.${target}:L${actualLine}`,
                source: sid,
                target: `${cname}.${target}`,
                type: 'call',
                line: actualLine,
              });
            } else if (contract.events.has(target) && line.includes('emit ')) {
              edges.push({
                id: `${sid}->${cname}.${target}:L${actualLine}`,
                source: sid,
                target: `${cname}.${target}`,
                type: 'emit',
                line: actualLine,
              });
            } else {
              for (const parent of contract.inherits) {
                const p = contracts.get(parent);
                if (p?.functions.has(target)) {
                  edges.push({
                    id: `${sid}->${parent}.${target}:L${actualLine}`,
                    source: sid,
                    target: `${parent}.${target}`,
                    type: 'call',
                    line: actualLine,
                  });
                  break;
                }
              }
            }
          } else {
            let extType: CallGraphEdge['type'] = 'call';
            const isExt = /\.(call|delegatecall|staticcall|send|transfer)\s*[({]/i.test(line);
            if (isExt) {
              if (/delegatecall/i.test(line)) extType = 'delegatecall';
              else if (/staticcall/i.test(line)) extType = 'staticcall';
              else if (/send/i.test(line)) extType = 'send';
              else if (/transfer/i.test(line)) extType = 'transfer';
            }

            const targetFunc = parts[parts.length - 1];
            const extId = `external.${targetFunc}`;

            if (isExt || parts[0] === 'this') {
              if (!nodes.find(n => n.id === extId)) {
                nodes.push({
                  id: extId,
                  label: targetFunc,
                  type: 'external',
                  contract: 'external',
                  visibility: 'external',
                  line: actualLine,
                });
              }
              edges.push({
                id: `${sid}->${extId}:L${actualLine}`,
                source: sid,
                target: extId,
                type: extType,
                line: actualLine,
              });
            } else {
              for (const [oname, octr] of contracts) {
                if (octr.functions.has(targetFunc)) {
                  edges.push({
                    id: `${sid}->${oname}.${targetFunc}:L${actualLine}`,
                    source: sid,
                    target: `${oname}.${targetFunc}`,
                    type: 'call',
                    line: actualLine,
                  });
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  const entryPoints = nodes
    .filter(n => (n.visibility === 'external' || n.visibility === 'public') &&
      (n.type === 'function' || n.type === 'fallback' || n.type === 'receive'))
    .map(n => n.id);

  return {
    nodes,
    edges,
    contracts: [...contracts.keys()],
    entryPoints,
  };
};

function modFilter(tokens: string[]): string[] {
  const skip = new Set([
    'function', 'modifier', 'event', 'constructor', 'fallback', 'receive',
    'public', 'external', 'internal', 'private',
    'payable', 'view', 'pure', 'constant', 'immutable',
    'returns', 'memory', 'storage', 'calldata', 'virtual', 'override',
    'return', 'returns',
  ]);
  return tokens
    .map(t => t.trim())
    .filter(t => !skip.has(t) && !t.match(/^(uint|int|bytes|address|bool|string|mapping|struct)/) && !t.match(/^\d/));
}
