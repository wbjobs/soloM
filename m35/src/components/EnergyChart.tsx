import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useSimulationStore, downsampleEnergies } from '@/store/simulationStore'

export default function EnergyChart() {
  const energies = useSimulationStore((s) => s.energies)

  const displayData = useMemo(() => {
    const sampled = downsampleEnergies(energies)
    return sampled.map((e) => [e.step, e.energy])
  }, [energies.length])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    animation: false,
    grid: {
      top: 30,
      right: 15,
      bottom: 30,
      left: 60,
      borderColor: 'rgba(30, 41, 59, 0.5)',
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#111827',
      borderColor: '#1e293b',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0]
        if (!p) return ''
        return `步数: ${p.value[0]}<br/>能量: ${p.value[1].toFixed(2)} kJ/mol`
      },
    },
    xAxis: {
      type: 'value' as const,
      name: '步数',
      nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(30, 41, 59, 0.3)' } },
    },
    yAxis: {
      type: 'value' as const,
      name: '能量 (kJ/mol)',
      nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(30, 41, 59, 0.3)' } },
    },
    series: [
      {
        type: 'line',
        data: displayData,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: '#06b6d4', width: 2 },
        sampling: 'lttb' as const,
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(6, 182, 212, 0.25)' },
              { offset: 1, color: 'rgba(6, 182, 212, 0.02)' },
            ],
          },
        },
      },
    ],
  }), [displayData])

  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4">
      <h3 className="text-[#e2e8f0] text-sm font-semibold mb-2">势能曲线</h3>
      <ReactECharts
        option={option}
        style={{ height: '250px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}
