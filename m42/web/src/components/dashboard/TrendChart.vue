<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const { getSlowlogTrend } = useApi()
const trendData = ref<{ time: string; count: number }[]>([])

onMounted(async () => {
  try {
    trendData.value = await getSlowlogTrend()
  } catch { }
})

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(22,27,34,0.95)',
    borderColor: 'rgba(0,212,170,0.2)',
    textStyle: { color: '#e6edf3', fontFamily: 'JetBrains Mono', fontSize: 12 },
  },
  grid: { top: 20, right: 20, bottom: 30, left: 50 },
  xAxis: {
    type: 'category',
    data: trendData.value.map(d => d.time),
    axisLine: { lineStyle: { color: 'rgba(0,212,170,0.15)' } },
    axisLabel: { color: '#6e7681', fontSize: 10, fontFamily: 'JetBrains Mono' },
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    splitLine: { lineStyle: { color: 'rgba(0,212,170,0.06)' } },
    axisLabel: { color: '#6e7681', fontSize: 10, fontFamily: 'JetBrains Mono' },
  },
  series: [{
    type: 'line',
    data: trendData.value.map(d => d.count),
    smooth: true,
    symbol: 'none',
    lineStyle: { color: '#00D4AA', width: 2 },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(0,212,170,0.3)' },
          { offset: 1, color: 'rgba(0,212,170,0.02)' },
        ],
      },
    },
  }],
}))
</script>

<template>
  <div class="glass-card p-5 animate-fade-in">
    <h3 class="text-sm font-mono text-primary/80 uppercase tracking-wider mb-4">24h Slowlog Trend</h3>
    <v-chart :option="option" autoresize style="height: 260px;" />
  </div>
</template>
