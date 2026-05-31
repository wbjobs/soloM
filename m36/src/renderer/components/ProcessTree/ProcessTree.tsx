import React, { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, Terminal, Activity } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { formatNumber, formatTimestamp, getSyscallColor } from '@/utils/format'
import type { ProcessNode } from '@shared/types'

interface TreeNodeProps {
  node: ProcessNode
  level: number
  isLast: boolean
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, level, isLast }) => {
  const [expanded, setExpanded] = useState(level < 2)
  const { setSelectedEvent, events } = useStore()

  const hasChildren = node.children && node.children.length > 0

  const handleNodeClick = useCallback(() => {
    if (hasChildren) {
      setExpanded(!expanded)
    }

    const processEvents = events.filter((e) => e.pid === node.pid)
    if (processEvents.length > 0) {
      setSelectedEvent(processEvents[processEvents.length - 1])
    }
  }, [expanded, hasChildren, node.pid, events, setSelectedEvent])

  const topSyscall = Object.entries(node.syscallCount).sort((a, b) => b[1] - a[1])[0]

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-cyber-border/50 cursor-pointer transition-all duration-200 group ${
          node.pid === 0 ? 'font-semibold' : ''
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={handleNodeClick}
      >
        <div className="w-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="w-4 h-4 text-neon-cyan transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 transition-transform group-hover:text-neon-cyan" />
            )
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
          )}
        </div>

        <div className="flex-shrink-0">
          {node.pid === 0 ? (
            <Activity className="w-4 h-4 text-neon-cyan" />
          ) : (
            <Terminal className="w-4 h-4 text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm truncate" style={{
              color: node.pid === 0 ? '#00f5d4' : topSyscall ? getSyscallColor(topSyscall[0]) : '#e5e7eb'
            }}>
              {node.name}
            </span>
            <span className="text-xs text-gray-500 font-mono">PID: {node.pid}</span>
            {node.ppid > 0 && (
              <span className="text-xs text-gray-600 font-mono">PPID: {node.ppid}</span>
            )}
          </div>

          {node.totalSyscalls > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex gap-1">
                {Object.entries(node.syscallCount)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([syscall, count]) => (
                    <span
                      key={syscall}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: getSyscallColor(syscall) + '20',
                        color: getSyscallColor(syscall),
                      }}
                    >
                      {syscall}: {formatNumber(count)}
                    </span>
                  ))}
              </div>
              <span className="text-xs text-gray-500">
                总计: {formatNumber(node.totalSyscalls)}
              </span>
            </div>
          )}
        </div>

        {node.startTime > 0 && node.pid !== 0 && (
          <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">
            {formatTimestamp(node.startTime)}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="relative">
          {node.children.map((child, index) => (
            <div key={child.pid} className="relative">
              <div
                className="absolute left-[26px] top-0 bottom-0 w-px bg-cyber-border"
                style={{ display: index === node.children.length - 1 ? 'none' : 'block' }}
              />
              <div className="absolute left-[26px] top-[14px] w-3 h-px bg-cyber-border" />
              <TreeNode
                node={child}
                level={level + 1}
                isLast={index === node.children.length - 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const ProcessTree: React.FC = () => {
  const { processTree } = useStore()

  if (!processTree) {
    return (
      <div className="glass-panel p-4 h-96 flex items-center justify-center">
        <div className="text-gray-500 text-center">
          <div className="text-4xl mb-2">🌳</div>
          <div className="font-mono">等待进程树数据...</div>
        </div>
      </div>
    )
  }

  const totalProcesses = (node: ProcessNode): number => {
    let count = 1
    for (const child of node.children) {
      count += totalProcesses(child)
    }
    return count
  }

  const processCount = totalProcesses(processTree) - 1

  return (
    <div className="glass-panel p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-lg font-semibold text-neon-purple glow-text flex items-center gap-2">
          <span className="text-xl">🌲</span>
          进程树
        </h3>
        <div className="text-xs text-gray-500 font-mono">
          共 {processCount} 个活跃进程
        </div>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-sm pr-2">
        <TreeNode node={processTree} level={0} isLast={true} />
      </div>
    </div>
  )
}
