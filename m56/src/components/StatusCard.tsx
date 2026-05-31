interface StatusCardProps {
  title: string
  value: number
  unit: string
  color: 'blue' | 'green' | 'purple' | 'orange'
  subValue: string
  subLabel: string
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    progress: 'bg-blue-500',
  },
  green: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    progress: 'bg-green-500',
  },
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    progress: 'bg-purple-500',
  },
  orange: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    progress: 'bg-orange-500',
  },
}

export default function StatusCard({ title, value, unit, color, subValue, subLabel }: StatusCardProps) {
  const colors = colorClasses[color]
  const displayValue = typeof value === 'number' ? value.toFixed(1) : '0'

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
        <div className={`${colors.bg} ${colors.text} px-2 py-1 rounded-md text-xs font-medium`}>
          实时
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-3xl font-bold text-white">
          {displayValue}
        </span>
        <span className={colors.text}>{unit}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
        <div
          className={`${colors.progress} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%`}}
        ></div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{subLabel}:</span>
        <span className="text-slate-300">{subValue}</span>
      </div>
    </div>
  )
}
