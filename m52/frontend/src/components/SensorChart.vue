<template>
  <div class="chart-container">
    <div class="chart-header">
      <span class="chart-title">{{ title }}</span>
      <span v-if="granularity" class="granularity-badge" :class="granularity">
        {{ granularityText }}
      </span>
    </div>
    <div ref="chartRef" class="chart"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'
import { sensorApi } from '../api'

const props = defineProps({
  title: {
    type: String,
    default: '传感器数据'
  },
  deviceId: {
    type: String,
    required: true
  },
  dataType: {
    type: String,
    default: 'temperature'
  },
  color: {
    type: String,
    default: '#667eea'
  },
  threshold: {
    type: Number,
    default: null
  },
  showDataZoom: {
    type: Boolean,
    default: true
  },
  smartQuery: {
    type: Boolean,
    default: true
  },
  defaultHours: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['dataLoaded', 'granularityChanged', 'zoomChanged'])

const chartRef = ref(null)
const chartData = ref([])
const granularity = ref('')
const isLoading = ref(false)
const currentStart = ref(null)
const currentEnd = ref(null)

let chartInstance = null
let debounceTimer = null

const granularityText = computed(() => {
  const map = {
    raw: '原始精度',
    hourly: '小时聚合',
    daily: '日级聚合'
  }
  return map[granularity.value] || ''
})

const formatTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const duration = currentEnd.value && currentStart.value 
    ? new Date(currentEnd.value) - new Date(currentStart.value)
    : 0
  
  if (duration > 7 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString('zh-CN')
  } else if (duration > 24 * 60 * 60 * 1000) {
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' })
  } else {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
}

const loadData = async (startTime, endTime, forceGranularity = '') => {
  if (!props.deviceId || !props.smartQuery) return
  
  isLoading.value = true
  try {
    const params = {
      type: props.dataType,
      max_points: 500
    }
    
    if (startTime) params.start_time = new Date(startTime).toISOString()
    if (endTime) params.end_time = new Date(endTime).toISOString()
    if (forceGranularity) params.granularity = forceGranularity
    
    const res = await sensorApi.getSmart(props.deviceId, params)
    const data = res.data
    
    granularity.value = data.granularity
    currentStart.value = data.start_time
    currentEnd.value = data.end_time
    
    if (data.granularity === 'raw') {
      chartData.value = (data.raw_data || data.data || []).map(item => ({
        timestamp: item.timestamp,
        value: item.value
      }))
    } else {
      chartData.value = (data.data || []).map(item => ({
        timestamp: item.bucket,
        value: item.avg,
        min: item.min,
        max: item.max,
        count: item.count
      }))
    }
    
    emit('dataLoaded', {
      granularity: data.granularity,
      count: chartData.value.length,
      data: chartData.value
    })
    
    updateChart()
  } catch (error) {
    console.error('Failed to load sensor data:', error)
  } finally {
    isLoading.value = false
  }
}

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  chartInstance.on('dataZoom', handleDataZoom)
  
  updateChart()
  
  window.addEventListener('resize', handleResize)
  
  if (props.smartQuery) {
    const now = new Date()
    const start = new Date(now.getTime() - props.defaultHours * 60 * 60 * 1000)
    loadData(start, now)
  }
}

const handleDataZoom = (params) => {
  if (!props.smartQuery) return
  
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  
  debounceTimer = setTimeout(() => {
    const option = chartInstance.getOption()
    const xAxisData = option.xAxis[0].data
    
    if (!xAxisData || xAxisData.length === 0) return
    
    const model = chartInstance.getModel()
    const dataZoomModel = model._componentsMap.get('dataZoom')
    
    if (!dataZoomModel) return
    
    const start = dataZoomModel.get('start') / 100
    const end = dataZoomModel.get('end') / 100
    
    const dataLength = xAxisData.length
    const startIdx = Math.floor(start * dataLength)
    const endIdx = Math.ceil(end * dataLength)
    
    if (endIdx - startIdx < 2) return
    
    const startData = chartData.value[startIdx]
    const endData = chartData.value[endIdx - 1]
    
    if (!startData || !endData) return
    
    const startTime = new Date(startData.timestamp)
    const endTime = new Date(endData.timestamp)
    const duration = endTime - startTime
    
    emit('zoomChanged', { startTime, endTime, duration })
    
    loadData(startTime, endTime)
  }, 500)
}

const handleResize = () => {
  chartInstance?.resize()
}

const updateChart = () => {
  if (!chartInstance || chartData.value.length === 0) return

  const timeData = chartData.value.map(item => formatTime(item.timestamp))
  const isAggregated = granularity.value === 'hourly' || granularity.value === 'daily'
  
  const series = []
  
  if (isAggregated) {
    series.push({
      name: '最大值',
      type: 'line',
      data: chartData.value.map(item => item.max),
      smooth: true,
      symbol: 'none',
      lineStyle: {
        width: 0
      },
      stack: 'confidence-band',
      areaStyle: {
        color: props.color + '20'
      }
    })
    
    series.push({
      name: '最小值',
      type: 'line',
      data: chartData.value.map(item => item.min),
      smooth: true,
      symbol: 'none',
      lineStyle: {
        width: 0
      },
      stack: 'confidence-band',
      areaStyle: {
        color: '#fff'
      }
    })
    
    series.push({
      name: '平均值',
      type: 'line',
      data: chartData.value.map(item => item.value),
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      sampling: 'lttb',
      itemStyle: {
        color: props.color
      },
      lineStyle: {
        width: 2
      }
    })
  } else {
    series.push({
      name: '数值',
      type: 'line',
      data: chartData.value.map(item => item.value),
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      sampling: 'lttb',
      itemStyle: {
        color: props.color
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: props.color + '80' },
          { offset: 1, color: props.color + '10' }
        ])
      },
      lineStyle: {
        width: 2
      }
    })
  }

  if (props.threshold !== null) {
    series.push({
      name: '阈值',
      type: 'line',
      markLine: {
        silent: true,
        lineStyle: {
          color: '#f56c6c',
          type: 'dashed'
        },
        data: [
          {
            yAxis: props.threshold,
            label: {
              formatter: `阈值: ${props.threshold}`,
              color: '#f56c6c'
            }
          }
        ]
      }
    })
  }

  const tooltipFormatter = (params) => {
    if (!params || params.length === 0) return ''
    
    const idx = params[0].dataIndex
    const dataPoint = chartData.value[idx]
    if (!dataPoint) return ''
    
    let html = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].axisValue}</div>`
    
    if (isAggregated) {
      html += `<div style="color: #409eff;">最大值: ${dataPoint.max?.toFixed(2) || 'N/A'}</div>`
      html += `<div style="color: ${props.color};">平均值: ${dataPoint.value?.toFixed(2) || 'N/A'}</div>`
      html += `<div style="color: #67c23a;">最小值: ${dataPoint.min?.toFixed(2) || 'N/A'}</div>`
      html += `<div style="color: #909399; font-size: 12px;">数据点: ${dataPoint.count || 0}</div>`
    } else {
      html += `<div>${params[0].marker} 数值: ${dataPoint.value?.toFixed(2) || 'N/A'}</div>`
    }
    
    return html
  }

  const option = {
    title: {
      show: false
    },
    tooltip: {
      trigger: 'axis',
      formatter: tooltipFormatter,
      backgroundColor: 'rgba(50, 50, 50, 0.9)',
      borderColor: '#333',
      textStyle: {
        color: '#fff'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: props.showDataZoom ? '15%' : '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeData,
      axisLabel: {
        rotate: 0,
        fontSize: 10,
        interval: Math.floor(timeData.length / 8)
      }
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      },
      axisLabel: {
        fontSize: 10
      }
    },
    series
  }

  if (props.showDataZoom) {
    option.dataZoom = [
      {
        type: 'inside',
        start: 0,
        end: 100,
        throttle: 100
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 20,
        bottom: 10,
        borderColor: '#ddd',
        fillerColor: props.color + '30',
        handleStyle: {
          color: props.color
        },
        textStyle: {
          fontSize: 10
        }
      }
    ]
  }

  chartInstance.setOption(option, true)
}

const refresh = () => {
  if (props.smartQuery && currentStart.value && currentEnd.value) {
    loadData(currentStart.value, currentEnd.value)
  }
}

const setTimeRange = (hours) => {
  const now = new Date()
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000)
  loadData(start, now)
}

watch(() => props.deviceId, () => {
  if (props.smartQuery) {
    const now = new Date()
    const start = new Date(now.getTime() - props.defaultHours * 60 * 60 * 1000)
    loadData(start, now)
  }
})

watch(() => props.dataType, () => {
  if (props.smartQuery && currentStart.value && currentEnd.value) {
    loadData(currentStart.value, currentEnd.value)
  }
})

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  chartInstance?.dispose()
})

defineExpose({
  updateChart,
  refresh,
  loadData,
  setTimeRange
})
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  min-height: 350px;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px 4px 0 0;
}

.chart-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.granularity-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.granularity-badge.raw {
  background: #e1f3d8;
  color: #67c23a;
}

.granularity-badge.hourly {
  background: #faecd8;
  color: #e6a23c;
}

.granularity-badge.daily {
  background: #fde2e2;
  color: #f56c6c;
}

.chart {
  flex: 1;
  width: 100%;
  min-height: 300px;
}
</style>
