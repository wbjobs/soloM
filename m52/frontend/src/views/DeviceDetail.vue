<template>
  <div class="device-detail">
    <el-page-header @back="$router.back()" content="设备详情" />

    <el-card class="mt-20">
      <template #header>
        <div class="card-header">
          <span>设备信息</span>
          <el-tag :type="device?.status === 'active' ? 'success' : 'info'">
            {{ device?.status === 'active' ? '活跃' : '离线' }}
          </el-tag>
        </div>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="设备名称">{{ device?.name }}</el-descriptions-item>
        <el-descriptions-item label="设备类型">{{ device?.type }}</el-descriptions-item>
        <el-descriptions-item label="设备ID">{{ deviceId }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(device?.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDate(device?.updated_at) }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ device?.description || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="mt-20">
      <template #header>
        <div class="card-header">
          <span>实时数据</span>
          <el-button type="primary" @click="startRealtime" :disabled="isRealtime">
            开始实时刷新
          </el-button>
          <el-button @click="stopRealtime" :disabled="!isRealtime">
            停止
          </el-button>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-statistic title="当前温度" :value="latestTemp?.value || 0" :precision="2" suffix="°C">
            <template #suffix>
              <span v-if="latestTemp?.unit">°{{ latestTemp.unit === 'C' ? 'C' : latestTemp.unit }}</span>
              <span v-else>°C</span>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="12">
          <el-statistic title="当前湿度" :value="latestHumidity?.value || 0" :precision="2" suffix="%">
            <template #suffix>
              <span>{{ latestHumidity?.unit || '%' }}</span>
            </template>
          </el-statistic>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="mt-20">
      <template #header>
        <div class="card-header">
          <span>智能图表（缩放查看不同时间跨度）</span>
          <el-radio-group v-model="timeRange" size="small" @change="handleTimeRangeChange">
            <el-radio-button :value="1">1小时</el-radio-button>
            <el-radio-button :value="6">6小时</el-radio-button>
            <el-radio-button :value="24">24小时</el-radio-button>
            <el-radio-button :value="72">3天</el-radio-button>
            <el-radio-button :value="168">7天</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="12">
          <SensorChart
            ref="tempChartRef"
            title="温度趋势"
            :device-id="deviceId"
            data-type="temperature"
            color="#f56c6c"
            :threshold="35"
            :smart-query="true"
            :default-hours="timeRange"
            style="height: 400px"
            @data-loaded="handleTempDataLoaded"
          />
        </el-col>
        <el-col :span="12">
          <SensorChart
            ref="humidityChartRef"
            title="湿度趋势"
            :device-id="deviceId"
            data-type="humidity"
            color="#409eff"
            :smart-query="true"
            :default-hours="timeRange"
            style="height: 400px"
            @data-loaded="handleHumidityDataLoaded"
          />
        </el-col>
      </el-row>
    </el-card>

    <el-card class="mt-20">
      <template #header>
        <span>历史数据查询</span>
      </template>
      <el-form :inline="true">
        <el-form-item label="数据类型">
          <el-select v-model="queryType" style="width: 120px">
            <el-option label="温度" value="temperature" />
            <el-option label="湿度" value="humidity" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据条数">
          <el-input-number v-model="queryLimit" :min="10" :max="500" :step="10" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadSensorData">查询</el-button>
        </el-form-item>
      </el-form>
      <el-table :data="historyData" style="width: 100%" max-height="300">
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            {{ row.type === 'temperature' ? '温度' : '湿度' }}
          </template>
        </el-table-column>
        <el-table-column prop="value" label="数值" :formatter="(row) => row.value?.toFixed(2)" />
        <el-table-column prop="unit" label="单位" width="80" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { deviceApi, sensorApi } from '../api'
import SensorChart from '../components/SensorChart.vue'

const route = useRoute()
const deviceId = route.params.id

const device = ref(null)
const latestTemp = ref({ value: 0, unit: 'C' })
const latestHumidity = ref({ value: 0, unit: '%' })
const temperatureData = ref([])
const humidityData = ref([])
const historyData = ref([])
const queryType = ref('temperature')
const queryLimit = ref(100)
const isRealtime = ref(false)
const timeRange = ref(1)
const tempChartRef = ref(null)
const humidityChartRef = ref(null)
let refreshInterval = null

const loadDevice = async () => {
  try {
    const res = await deviceApi.get(deviceId)
    device.value = res.data
  } catch (error) {
    console.error('Failed to load device:', error)
  }
}

const loadSensorData = async () => {
  try {
    const [tempRes, humRes, historyRes] = await Promise.all([
      sensorApi.getData(deviceId, { type: 'temperature', limit: 50 }),
      sensorApi.getData(deviceId, { type: 'humidity', limit: 50 }),
      sensorApi.getData(deviceId, { type: queryType.value, limit: queryLimit.value })
    ])
    
    temperatureData.value = tempRes.data.data || []
    humidityData.value = humRes.data.data || []
    historyData.value = historyRes.data.data || []

    if (temperatureData.value.length > 0) {
      latestTemp.value = temperatureData.value[0]
    }
    if (humidityData.value.length > 0) {
      latestHumidity.value = humidityData.value[0]
    }
  } catch (error) {
    console.error('Failed to load sensor data:', error)
  }
}

const handleTimeRangeChange = (hours) => {
  tempChartRef.value?.setTimeRange(hours)
  humidityChartRef.value?.setTimeRange(hours)
}

const handleTempDataLoaded = (data) => {
  if (data.data && data.data.length > 0) {
    const latest = data.data[0]
    latestTemp.value = { value: latest.value, unit: 'C' }
  }
}

const handleHumidityDataLoaded = (data) => {
  if (data.data && data.data.length > 0) {
    const latest = data.data[0]
    latestHumidity.value = { value: latest.value, unit: '%' }
  }
}

const startRealtime = () => {
  isRealtime.value = true
  loadSensorData()
  refreshInterval = setInterval(() => {
    tempChartRef.value?.refresh()
    humidityChartRef.value?.refresh()
  }, 2000)
}

const stopRealtime = () => {
  isRealtime.value = false
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadDevice()
  loadSensorData()
})

onUnmounted(() => {
  stopRealtime()
})
</script>

<style scoped>
.device-detail {
  width: 100%;
}

.mt-20 {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
