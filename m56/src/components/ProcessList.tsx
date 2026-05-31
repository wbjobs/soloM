import type { ProcessData } from '../types'

interface ProcessListProps {
  processes: ProcessData[]
}

export default function ProcessList({ processes }: ProcessListProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">进程列表</h3>
        <span className="text-sm text-slate-400">按 CPU 占用排序</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
              <th className="pb-3 font-medium">PID</th>
              <th className="pb-3 font-medium">进程名</th>
              <th className="pb-3 font-medium text-right">CPU</th>
              <th className="pb-3 font-medium text-right">内存</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((process, index) => (
              <tr 
                key={`${process.pid}-${index}`}
                className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
              >
                <td className="py-3 text-slate-300 text-sm font-mono">
                  {process.pid}
                </td>
                <td className="py-3 text-white text-sm">
                  {process.name}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          process.cpu > 50 ? 'bg-red-500' : process.cpu > 20 ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(process.cpu, 100)}%` }}
                      ></div>
                    </div>
                    <span className={`text-sm font-medium w-16 text-right ${
                      process.cpu > 50 ? 'text-red-400' : process.cpu > 20 ? 'text-yellow-400' : 'text-slate-300'
                    }`}>
                      {process.cpu.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="py-3 text-right text-slate-300 text-sm">
                  {process.memory.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {processes.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          正在加载进程数据...
        </div>
      )}
    </div>
  )
}
