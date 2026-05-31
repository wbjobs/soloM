<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon device-icon">
              <el-icon><Cpu /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ deviceCount }}</div>
              <div class="stat-label">设备总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon active-icon">
              <el-icon><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ activeDevices }}</div>
              <div class="stat-label">活跃设备</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon anomaly-icon">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ anomalyCount }}</div>
              <div class="stat-label">异常记录</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon data-icon">
              <el-icon><DataLine /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ dataPoints }}</div>
              <div class="stat-label">数据点</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-20">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>实时监控</span>
              <el-select v-model="selectedDevice" placeholder="选择设备" @change="loadDeviceData" style="width: 200px">
                <el-option
                  v-for="device in devices"
                  :key="device.id"
                  :label="device.name"
                  :value="device.id"
                />
              </el-select>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="12">
              <SensorChart
                v-if="selectedDevice"
                title="温度 (°C)"
                :device-id="selectedDevice"
                data-type="temperature"
                color="#f56c6c"
                :threshold="35"
                :smart-query="true"
                :default-hours="1"
                style="height: 350px"
                @data-loaded="handleTempDataLoaded"
              />
            </el-col>
            <el-col :span="12">
              <SensorChart
                v-if="selectedDevice"
                title="湿度 (%)"
                :device-id="selectedDevice"
                data-type="humidity"
                color="#409eff"
                :smart-query="true"
                :default-hours="1"
                style="height: 350px"
                @data-loaded="handleHumidityDataLoaded"
              />
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>设备状态</span>
          </template>
          <el-table :data="devices" style="width: 100%">
            <el-table-column prop="name" label="设备名称" />
            <el-table-column prop="type" label="类型" />
            <el-table-column prop="status" label="状态">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">
                  {{ row.status === 'active' ? '活跃' : '离线' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToDetail(row.id)">
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>最新异常</span>
          </template>
          <el-table :data="recentAnomalies" style="width: 100%">
            <el-table-column prop="device_id" label="设备ID" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" />
            <el-table-column prop="duration" label="持续(秒)">
              <template #default="{ row }">
                {{ row.duration?.toFixed(1) }}
              </template>
            </el-table-column>
            <el-table-column prop="threshold" label="阈值" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Cpu, CircleCheck, Warning, DataLine } from '@element-plus/icons-vue'
import { deviceApi, anomalyApi, sensorApi } from '../api'
import SensorChart from '../components/SensorChart.vue'

const router = useRouter()
const devices = ref([])
const selectedDevice = ref('')
const deviceCount = ref(0)
const activeDevices = ref(0)
const anomalyCount = ref(0)
const dataPoints = ref(0)
const temperatureData = ref([])
const humidityData = ref([])
const recentAnomalies = ref([])

const loadDevices = async () => {
  try {
    const res = await deviceApi.list()
    devices.value = res.data
    deviceCount.value = res.data.length
    activeDevices.value = res.data.filter(d => d.status === 'active').length
    
    if (res.data.length > 0) {
      selectedDevice.value = res.data[0].id
      loadDeviceData(res.data[0].id)
    }
  } catch (error) {
    console.error('Failed to load devices:', error)
  }
}

const loadDeviceData = async (deviceId) => {
  try {
    const [tempRes, humRes] = await Promise.all([
      sensorApi.getData(deviceId, { type: 'temperature', limit: 50 }),
      sensorApi.getData(deviceId, { type: 'humidity', limit: 50 })
    ])
    
    temperatureData.value = tempRes.data.data || []
    humidityData.value = humRes.data.data || []
    dataPoints.value = temperatureData.value.length + humidityData.value.length
  } catch (error) {
    console.error('Failed to load sensor data:', error)
  }
}

const handleTempDataLoaded = (data) => {
  dataPoints.value = (dataPoints.value || 0) + (data.count || 0)
}

const handleHumidityDataLoaded = (data) => {
  dataPoints.value = (dataPoints.value || 0) + (data.count || 0)
}

const loadAnomalies = async () => {
  try {
    const res = await anomalyApi.getRecords('', { limit: 10 })
    recentAnomalies.value = res.data.records || []
    anomalyCount.value = res.data.count || 0
  } catch (error) {
    console.error('Failed to load anomalies:', error)
  }
}

const goToDetail = (id) => {
  router.push(`/device/${id}`)
}

onMounted(() => {
  loadDevices()
  loadAnomalies()
})
</script>

<style scoped>
.dashboard {
  width: 100%;
}

.stat-card {
  border-radius: 8px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 20px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
}

.device-icon {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.active-icon {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.anomaly-icon {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
}

.data-icon {
  background: linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
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
