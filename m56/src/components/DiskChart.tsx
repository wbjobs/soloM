import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface DiskChartProps {
  data: { time: string; read: number; write: number }[]
}

export default function DiskChart({ data }: DiskChartProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">磁盘 I/O</h3>
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
              tickFormatter={(value) => `${value} IO/s`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f1f5f9',
              }}
              formatter={(value: number, name: string) => [
                `${value} IO/s`,
                name === 'read' ? '读取' : '写入'
              ]}
            />
            <Legend 
              wrapperStyle={{ color: '#94a3b8' }}
              formatter={(value) => value === 'read' ? '读取' : '写入'}
            />
            <Line
              type="monotone"
              dataKey="write"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#f97316' }}
            />
            <Line
              type="monotone"
              dataKey="read"
              stroke="#eab308"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#eab308' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
