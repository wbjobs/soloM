import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { ChartDataPoint } from '../types'

interface CpuChartProps {
  data: ChartDataPoint[]
}

export default function CpuChart({ data }: CpuChartProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">CPU 使用率</h3>
        <span className="text-sm text-slate-400">最近 60 秒</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              stroke="#64748b" 
              tick={{ fontSize: 10 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f1f5f9',
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU']}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
