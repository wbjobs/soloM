<template>
  <div class="anomaly-detection">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="config-card">
          <template #header>
            <span>异常检测配置</span>
          </template>
          <el-form :model="config" label-width="100px">
            <el-form-item label="选择设备">
              <el-select v-model="config.device_id" placeholder="请选择设备" style="width: 100%">
                <el-option
                  v-for="device in devices"
                  :key="device.id"
                  :label="device.name"
                  :value="device.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="传感器类型">
              <el-select v-model="config.sensor_type" placeholder="请选择类型" style="width: 100%">
                <el-option label="温度" value="temperature" />
                <el-option label="湿度" value="humidity" />
                <el-option label="压力" value="pressure" />
              </el-select>
            </el-form-item>
            <el-form-item label="阈值">
              <el-input-number
                v-model="config.threshold"
                :min="0"
                :max="100"
                :step="0.5"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="时间窗口(秒)">
              <el-input-number
                v-model="config.window_seconds"
                :min="1"
                :max="3600"
                :step="1"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="比较类型">
              <el-select v-model="config.comparison_type" style="width: 100%">
                <el-option label="高于阈值" value="above" />
                <el-option label="低于阈值" value="below" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="runDetection" :loading="detecting">
                开始检测
              </el-button>
              <el-button @click="checkRealtime" :loading="checkingRealtime">
                实时检测
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card class="mt-20 realtime-card">
          <template #header>
            <span>实时状态</span>
            <el-badge :is-dot="realtimeResult?.is_anomaly" :type="realtimeResult?.is_anomaly ? 'danger' : 'success'" />
          </template>
          <div v-if="realtimeResult">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="异常状态">
                <el-tag :type="realtimeResult.is_anomaly ? 'danger' : 'success'">
                  {{ realtimeResult.is_anomaly ? '检测到异常' : '正常' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="超阈值持续">
                {{ realtimeResult.duration_above?.toFixed(2) }} 秒
              </el-descriptions-item>
              <el-descriptions-item label="最高值">
                {{ realtimeResult.max_value?.toFixed(2) }}
              </el-descriptions-item>
              <el-descriptions-item label="平均值">
                {{ realtimeResult.avg_value?.toFixed(2) }}
              </el-descriptions-item>
              <el-descriptions-item label="数据点数">
                {{ realtimeResult.data_points }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
          <el-empty v-else description="暂无数据" />
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>检测结果</span>
              <el-tag type="danger" v-if="detectionResults.length > 0">
                发现 {{ detectionResults.length }} 个异常
              </el-tag>
            </div>
          </template>
          <el-table :data="detectionResults" style="width: 100%" v-loading="detecting">
            <el-table-column label="序号" type="index" width="60" />
            <el-table-column prop="start_time" label="开始时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.start_time) }}
              </template>
            </el-table-column>
            <el-table-column prop="end_time" label="结束时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.end_time) }}
              </template>
            </el-table-column>
            <el-table-column prop="duration_seconds" label="持续时间(秒)" width="120">
              <template #default="{ row }">
                {{ row.duration_seconds?.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="max_value" label="最高值" width="100">
              <template #default="{ row }">
                {{ row.max_value?.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="avg_value" label="平均值" width="100">
              <template #default="{ row }">
                {{ row.avg_value?.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="data_points" label="数据点" width="80" />
            <el-table-column prop="threshold" label="阈值" width="80" />
          </el-table>
          <el-empty v-if="detectionResults.length === 0 && !detecting" description="暂无异常记录" />
        </el-card>

        <el-card class="mt-20">
          <template #header>
            <span>历史异常记录</span>
          </template>
          <el-table :data="anomalyRecords" style="width: 100%">
            <el-table-column prop="device_id" label="设备ID" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="start_time" label="开始时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.start_time) }}
              </template>
            </el-table-column>
            <el-table-column prop="end_time" label="结束时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.end_time) }}
              </template>
            </el-table-column>
            <el-table-column prop="duration" label="持续(秒)" width="100">
              <template #default="{ row }">
                {{ row.duration?.toFixed(1) }}
              </template>
            </el-table-column>
            <el-table-column prop="threshold" label="阈值" width="80" />
            <el-table-column prop="description" label="描述" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { deviceApi, anomalyApi } from '../api'

const devices = ref([])
const detecting = ref(false)
const checkingRealtime = ref(false)
const detectionResults = ref([])
const anomalyRecords = ref([])
const realtimeResult = ref(null)

const config = reactive({
  device_id: '',
  sensor_type: 'temperature',
  threshold: 35,
  window_seconds: 5,
  comparison_type: 'above'
})

const loadDevices = async () => {
  try {
    const res = await deviceApi.list()
    devices.value = res.data
    if (res.data.length > 0) {
      config.device_id = res.data[0].id
    }
  } catch (error) {
    console.error('Failed to load devices:', error)
  }
}

const loadAnomalyRecords = async () => {
  try {
    const res = await anomalyApi.getRecords('', { limit: 20 })
    anomalyRecords.value = res.data.records || []
  } catch (error) {
    console.error('Failed to load anomaly records:', error)
  }
}

const runDetection = async () => {
  if (!config.device_id) {
    ElMessage.warning('请选择设备')
    return
  }

  detecting.value = true
  try {
    const res = await anomalyApi.detect(config)
    detectionResults.value = res.data.anomalies || []
    
    if (detectionResults.value.length > 0) {
      ElMessage.warning(`检测到 ${detectionResults.value.length} 个异常`)
    } else {
      ElMessage.success('未检测到异常')
    }
    
    loadAnomalyRecords()
  } catch (error) {
    ElMessage.error('检测失败')
  } finally {
    detecting.value = false
  }
}

const checkRealtime = async () => {
  if (!config.device_id) {
    ElMessage.warning('请选择设备')
    return
  }

  checkingRealtime.value = true
  try {
    const res = await anomalyApi.checkRealtime(config.device_id, {
      type: config.sensor_type,
      threshold: config.threshold,
      window: config.window_seconds
    })
    realtimeResult.value = res.data
    
    if (res.data.is_anomaly) {
      ElMessage.warning('实时检测到异常！')
    } else {
      ElMessage.success('当前状态正常')
    }
  } catch (error) {
    ElMessage.error('实时检测失败')
  } finally {
    checkingRealtime.value = false
  }
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadDevices()
  loadAnomalyRecords()
})
</script>

<style scoped>
.anomaly-detection {
  width: 100%;
}

.config-card {
  height: auto;
}

.realtime-card {
  margin-top: 20px;
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
