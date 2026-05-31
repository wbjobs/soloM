<template>
  <div class="status-card" :class="'color-' + color">
    <div class="card-header">
      <span class="card-title">{{ title }}</span>
    </div>
    <div class="card-value-row">
      <span class="card-value">{{ formattedValue }}</span>
      <span class="card-unit">{{ unit }}</span>
    </div>
    <div class="card-delta" :class="deltaClass">
      <svg v-if="delta > 0" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
      <svg v-else-if="delta < 0" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>{{ formattedDelta }}</span>
    </div>
    <div ref="sparkRef" class="card-spark"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = withDefaults(defineProps<{
  title: string
  value: number
  delta: number
  unit: string
  color: 'blue' | 'green' | 'yellow' | 'red'
  precision?: number
}>(), {
  precision: 0
})

const sparkRef = ref<HTMLDivElement>()
let sparkChart: echarts.ECharts | null = null
const sparkData = ref<number[]>([])

const formattedValue = computed(() => {
  return props.precision > 0 ? props.value.toFixed(props.precision) : Math.round(props.value).toString()
})

const formattedDelta = computed(() => {
  const abs = Math.abs(props.delta)
  const val = props.precision > 0 ? abs.toFixed(props.precision) : Math.round(abs).toString()
  return props.delta > 0 ? `+${val}` : val
})

const deltaClass = computed(() => {
  if (props.delta > 0) return 'delta-up'
  if (props.delta < 0) return 'delta-down'
  return 'delta-flat'
})

const colorMap: Record<string, string> = {
  blue: '#2979ff',
  green: '#53d769',
  yellow: '#ffc107',
  red: '#e94560'
}

function updateSparkline() {
  if (!sparkChart) return
  sparkData.value.push(props.value)
  if (sparkData.value.length > 20) {
    sparkData.value.shift()
  }

  const color = colorMap[props.color]
  sparkChart.setOption({
    backgroundColor: 'transparent',
    grid: { top: 2, bottom: 2, left: 0, right: 0 },
    xAxis: { show: false, type: 'category', data: sparkData.value.map((_, i) => i) },
    yAxis: { show: false, type: 'value' },
    series: [{
      type: 'line',
      data: sparkData.value,
      smooth: true,
      showSymbol: false,
      lineStyle: { color, width: 1.5 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: color + '40' },
          { offset: 1, color: color + '00' }
        ])
      }
    }]
  }, { notMerge: false })
}

watch(() => props.value, () => {
  updateSparkline()
})

onMounted(() => {
  if (sparkRef.value) {
    sparkChart = echarts.init(sparkRef.value)
    updateSparkline()
  }
})

onUnmounted(() => {
  sparkChart?.dispose()
  sparkChart = null
})
</script>

<style scoped>
.status-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
}

.status-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
}

.status-card.color-blue::before { background: #2979ff; }
.status-card.color-green::before { background: #53d769; }
.status-card.color-yellow::before { background: #ffc107; }
.status-card.color-red::before { background: #e94560; }

.card-header {
  margin-bottom: 6px;
}

.card-title {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.card-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.card-unit {
  font-size: 13px;
  color: var(--text-secondary);
}

.card-delta {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 500;
  margin-top: 4px;
}

.delta-up { color: var(--accent-red); }
.delta-down { color: var(--accent-green); }
.delta-flat { color: var(--text-secondary); }

.card-spark {
  height: 32px;
  margin-top: 6px;
}
</style>
