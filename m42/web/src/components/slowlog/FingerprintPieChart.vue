<script setup lang="ts">
import { computed } from 'vue'
import type { FingerprintStat } from '@/types'

const props = defineProps<{
  data: FingerprintStat[]
}>()

function formatDuration(us: number): string {
  if (us >= 1000000) return `${(us / 1000000).toFixed(2)}s`
  if (us >= 1000) return `${(us / 1000).toFixed(1)}ms`
  return `${us}μs`
}

const chartOption = computed(() => {
  const palette = ['#00D4AA', '#4A90D9', '#FF6B6B', '#FFB454', '#9D65C9', '#4ECDC4', '#FF8A80', '#B388FF', '#69F0AE', '#FFD180']

  const data = props.data.slice(0, 10).map((item, idx) => ({
    value: item.totalDurationUs,
    name: item.fingerprint.length > 45 ? item.fingerprint.slice(0, 42) + '...' : item.fingerprint,
    itemStyle: { color: palette[idx % palette.length] },
  }))

  if (props.data.length > 10) {
    const remaining = props.data.slice(10).reduce((acc, item) => acc + item.totalDurationUs, 0)
    data.push({
      value: remaining,
      name: 'Others',
      itemStyle: { color: '#6b7280' },
    })
  }

  return {
    tooltip: {
      backgroundColor: 'rgba(22,27,34,0.95)',
      borderColor: 'rgba(0,212,170,0.3)',
      textStyle: { color: '#e6edf3', fontFamily: 'JetBrains Mono', fontSize: 11 },
      formatter: (params: any) => {
        const original = props.data.find(d =>
          d.fingerprint === params.name ||
          d.fingerprint.slice(0, 42) + '...' === params.name
        )
        if (original) {
          return `<div style="margin-bottom:4px"><b style="color:#00D4AA">${original.fingerprint}</b></div>
            <div>Count: <span style="color:#c9d1d9">${original.count}</span></div>
            <div>Total: <span style="color:#c9d1d9">${formatDuration(original.totalDurationUs)}</span></div>
            <div>Avg: <span style="color:#c9d1d9">${formatDuration(Math.round(original.avgDurationUs))}</span></div>
            <div>Share: <span style="color:#00D4AA">${original.percentage.toFixed(1)}%</span></div>`
        }
        return params.name
      },
    },
    legend: {
      orient: 'vertical',
      right: 15,
      top: 'center',
      textStyle: { color: '#8b949e', fontSize: 10, fontFamily: 'JetBrains Mono' },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      width: 180,
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 4,
        borderColor: '#0D1117',
        borderWidth: 2,
      },
      label: {
        show: false,
      },
      emphasis: {
        label: {
          show: true,
          color: '#e6edf3',
          fontSize: 11,
          fontFamily: 'JetBrains Mono',
        },
        itemStyle: {
          shadowBlur: 20,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0,212,170,0.4)',
        },
      },
      labelLine: {
        show: false,
      },
      data,
    }],
  }
})
</script>

<template>
  <div class="glass-card border-primary/20 p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-mono font-semibold text-primary">Command Fingerprint by Total Time</h3>
      <span class="text-xs text-gray-500 font-mono">Top 10</span>
    </div>
    <v-chart :option="chartOption" autoresize style="height: 360px" />
  </div>
</template>
