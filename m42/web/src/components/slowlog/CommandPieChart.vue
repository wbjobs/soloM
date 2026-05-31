<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  data: { command: string; count: number }[]
}>()

const palette = ['#00D4AA', '#4A90D9', '#FF6B6B', '#EAB308', '#A855F7', '#EC4899', '#14B8A6', '#F97316']

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(22,27,34,0.95)',
    borderColor: 'rgba(0,212,170,0.2)',
    textStyle: { color: '#e6edf3', fontFamily: 'JetBrains Mono', fontSize: 11 },
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center',
    textStyle: { color: '#8b949e', fontSize: 11, fontFamily: 'JetBrains Mono' },
    itemWidth: 10,
    itemHeight: 10,
  },
  series: [{
    type: 'pie',
    radius: ['45%', '75%'],
    center: ['35%', '50%'],
    avoidLabelOverlap: false,
    label: { show: false },
    emphasis: {
      label: { show: true, fontSize: 12, fontWeight: 'bold', color: '#e6edf3', fontFamily: 'JetBrains Mono' },
    },
    data: props.data.map((d, i) => ({
      name: d.command,
      value: d.count,
      itemStyle: { color: palette[i % palette.length] },
    })),
  }],
}))
</script>

<template>
  <div class="glass-card p-5 animate-fade-in">
    <h3 class="text-sm font-mono text-primary/80 uppercase tracking-wider mb-4">Command Distribution</h3>
    <v-chart :option="option" autoresize style="height: 280px;" />
  </div>
</template>
