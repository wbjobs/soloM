<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  data: { range: string; count: number }[]
}>()

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(22,27,34,0.95)',
    borderColor: 'rgba(0,212,170,0.2)',
    textStyle: { color: '#e6edf3', fontFamily: 'JetBrains Mono', fontSize: 11 },
  },
  grid: { top: 20, right: 20, bottom: 30, left: 50 },
  xAxis: {
    type: 'category',
    data: props.data.map(d => d.range),
    axisLine: { lineStyle: { color: 'rgba(0,212,170,0.15)' } },
    axisLabel: { color: '#6e7681', fontSize: 10, fontFamily: 'JetBrains Mono', rotate: 30 },
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    splitLine: { lineStyle: { color: 'rgba(0,212,170,0.06)' } },
    axisLabel: { color: '#6e7681', fontSize: 10, fontFamily: 'JetBrains Mono' },
  },
  series: [{
    type: 'bar',
    data: props.data.map(d => d.count),
    barWidth: '60%',
    itemStyle: {
      borderRadius: [4, 4, 0, 0],
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: '#00D4AA' },
          { offset: 1, color: 'rgba(0,212,170,0.2)' },
        ],
      },
    },
  }],
}))
</script>

<template>
  <div class="glass-card p-5 animate-fade-in">
    <h3 class="text-sm font-mono text-primary/80 uppercase tracking-wider mb-4">Duration Distribution</h3>
    <v-chart :option="option" autoresize style="height: 280px;" />
  </div>
</template>
