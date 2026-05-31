import React from 'react'
import { Activity, Cpu, Zap, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { formatNumber, formatUptime } from '@/utils/format'

interface StatItemProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  trend?: 'up' | 'down' | 'neutral'
  subValue?: string
}

const StatItem: React.FC<StatItemProps> = ({ label, value, icon, color, trend, subValue }) => {
  return (
    <div className="stat-card card-hover group" style={{ color }}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
          <div className="text-3xl font-bold font-mono group-hover:animate-pulse">
            {value}
          </div>
          {subValue && (
            <div className="text-xs text-gray-400 mt-1 font-mono">{subValue}</div>
          )}
        </div>
        <div className="p-3 rounded-lg bg-opacity-20" style={{ backgroundColor: color + '20' }}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {trend === 'up' ? (
            <TrendingUp className="w-3 h-3 text-neon-green" />
          ) : trend === 'down' ? (
            <TrendingDown className="w-3 h-3 text-neon-red" />
          ) : null}
        </div>
      )}
    </div>
  )
}

export const StatsCard: React.FC = () => {
  const { statsData, collectorStatus } = useStore()

  const uptime = collectorStatus.startTime
    ? formatUptime(Date.now() - collectorStatus.startTime)
    : '未运行'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatItem
        label="总调用次数"
        value={formatNumber(statsData?.totalEvents || 0)}
        icon={<Activity className="w-6 h-6" />}
        color="#00f5d4"
        trend="up"
        subValue={`运行时间: ${uptime}`}
      />
      <StatItem
        label="活跃进程"
        value={formatNumber(statsData?.activeProcesses || 0)}
        icon={<Cpu className="w-6 h-6" />}
        color="#a55eea"
        trend="neutral"
      />
      <StatItem
        label="每秒调用"
        value={statsData?.eventsPerSecond || 0}
        icon={<Zap className="w-6 h-6" />}
        color="#ffa502"
        trend="up"
        subValue="Events/sec"
      />
      <StatItem
        label="异常告警"
        value={statsData?.alerts || 0}
        icon={<AlertTriangle className="w-6 h-6" />}
        color="#ff4757"
        trend={statsData && statsData.alerts > 0 ? 'up' : 'neutral'}
        subValue="需要关注"
      />

      {statsData && (statsData.topSyscalls.length > 0 || statsData.topProcesses.length > 0) && (
        <>
          <div className="lg:col-span-2 glass-panel p-4">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-neon-cyan" />
              热门系统调用
            </h4>
            <div className="space-y-2">
              {statsData.topSyscalls.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-mono w-4">#{index + 1}</span>
                  <span className="font-mono text-sm flex-1">{item.name}</span>
                  <div className="flex-1 max-w-[150px] h-2 bg-cyber-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(item.count / (statsData.topSyscalls[0]?.count || 1)) * 100}%`,
                        backgroundColor: index === 0 ? '#00f5d4' : index === 1 ? '#a55eea' : '#ffa502',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-400 w-16 text-right">
                    {formatNumber(item.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 glass-panel p-4">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-neon-purple" />
              最活跃进程
            </h4>
            <div className="space-y-2">
              {statsData.topProcesses.map((item, index) => (
                <div key={item.pid} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-mono w-4">#{index + 1}</span>
                  <span className="font-mono text-sm flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-gray-600 font-mono">PID: {item.pid}</span>
                  <div className="flex-1 max-w-[150px] h-2 bg-cyber-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(item.count / (statsData.topProcesses[0]?.count || 1)) * 100}%`,
                        backgroundColor: index === 0 ? '#a55eea' : index === 1 ? '#00f5d4' : '#ffa502',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-400 w-16 text-right">
                    {formatNumber(item.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
