<template>
  <div class="alert-panel">
    <div class="alert-header">
      <div class="alert-title">
        <el-icon class="alert-icon"><Warning /></el-icon>
        网络异常告警
        <el-badge v-if="unresolvedCount > 0" :value="unresolvedCount" :max="99" class="alert-badge" />
      </div>
      <div class="alert-actions">
        <el-button size="small" type="primary" @click="showWebhookDialog = true">
          <el-icon><Setting /></el-icon>
          Webhook
        </el-button>
        <el-button size="small" @click="loadAlerts">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <div class="alert-tabs">
      <el-radio-group v-model="activeTab" size="small" @change="onTabChange">
        <el-radio-button value="active">未处理</el-radio-button>
        <el-radio-button value="ack">已确认</el-radio-button>
        <el-radio-button value="resolved">已恢复</el-radio-button>
      </el-radio-group>
    </div>

    <div class="alert-list" ref="listRef">
      <div v-if="filteredAlerts.length === 0" class="alert-empty">
        <el-icon size="48" color="#555"><CircleCheck /></el-icon>
        <div>暂无{{ activeTab === 'active' ? '未处理' : activeTab === 'ack' ? '已确认' : '已恢复' }}告警</div>
      </div>
      <TransitionGroup name="alert-list">
        <div
          v-for="alert in filteredAlerts"
          :key="alert.id"
          class="alert-item"
          :class="[`severity-${alert.severity}`, { 'new-alert': newAlertIds.has(alert.id) }]"
          @animationend="removeNewAlert(alert.id)"
        >
          <div class="alert-indicator" :class="`indicator-${alert.severity}`"></div>
          <div class="alert-content">
            <div class="alert-main">
              <div class="alert-service">
                <span class="service-name">{{ alert.sourceService }}</span>
                <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                <span class="service-name">{{ alert.targetService }}</span>
              </div>
              <div class="alert-type-badge" :class="`type-${alert.type}`">
                {{ getAlertTypeLabel(alert.type) }}
              </div>
            </div>
            <div class="alert-message">{{ alert.message }}</div>
            <div class="alert-meta">
              <div class="meta-item">
                <span class="meta-label">当前值:</span>
                <span class="meta-value">{{ formatValue(alert.value, alert.type) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">基线:</span>
                <span class="meta-value">{{ formatValue(alert.baseline, alert.type) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">偏离:</span>
                <span class="meta-value deviation" :class="alert.deviationPercent > 100 ? 'high' : ''">
                  {{ alert.deviationPercent.toFixed(1) }}%
                </span>
              </div>
              <div class="meta-item">
                <span class="meta-label">时间:</span>
                <span class="meta-value">{{ formatTime(alert.timestamp) }}</span>
              </div>
            </div>
            <div class="alert-actions-row" v-if="activeTab === 'active'">
              <el-button size="small" type="primary" @click="ackAlert(alert)">
                <el-icon><Check /></el-icon>
                确认
              </el-button>
              <el-button size="small" type="success" @click="resolveAlert(alert)">
                <el-icon><CircleCheck /></el-icon>
                标记恢复
              </el-button>
            </div>
            <div class="alert-status-row" v-else>
              <el-tag :type="alert.ack ? 'primary' : 'info'" size="small">
                {{ alert.ack ? '已确认' : '未确认' }}
              </el-tag>
              <el-tag :type="alert.resolved ? 'success' : 'warning'" size="small">
                {{ alert.resolved ? '已恢复' : '未恢复' }}
              </el-tag>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <el-dialog v-model="showWebhookDialog" title="Webhook 配置" width="500px">
      <el-form :model="webhookForm" label-width="80px">
        <el-form-item label="启用">
          <el-switch v-model="webhookForm.enabled" />
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="webhookForm.url" placeholder="http://example.com/webhook" />
        </el-form-item>
        <el-form-item label="签名密钥">
          <el-input v-model="webhookForm.secret" type="password" placeholder="用于 HMAC-SHA256 签名" />
        </el-form-item>
        <el-form-item label="请求头">
          <div v-for="(header, idx) in webhookHeaders" :key="idx" class="header-row">
            <el-input v-model="header.key" placeholder="Key" style="width: 40%; margin-right: 8px" />
            <el-input v-model="header.value" placeholder="Value" style="width: 40%; margin-right: 8px" />
            <el-button size="small" type="danger" @click="removeHeader(idx)" v-if="webhookHeaders.length > 1">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button size="small" type="primary" plain @click="addHeader" style="margin-top: 8px">
            <el-icon><Plus /></el-icon>
            添加 Header
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showWebhookDialog = false">取消</el-button>
        <el-button type="primary" @click="saveWebhook">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAlertToast" width="400px" class="alert-toast-dialog">
      <div class="toast-content" :class="`toast-${latestAlert?.severity}`">
        <el-icon class="toast-icon"><Warning /></el-icon>
        <div class="toast-body">
          <div class="toast-title">检测到网络异常</div>
          <div class="toast-service">
            {{ latestAlert?.sourceService }} → {{ latestAlert?.targetService }}
          </div>
          <div class="toast-message">{{ latestAlert?.message }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { Warning, Setting, Refresh, ArrowRight, Check, CircleCheck, Delete, Plus } from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import type { Alert, AlertType } from '@/types'

const listRef = ref<HTMLElement>()
const activeTab = ref<'active' | 'ack' | 'resolved'>('active')
const alerts = ref<Alert[]>([])
const newAlertIds = ref<Set<string>>(new Set())
const latestAlert = ref<Alert | null>(null)
const showAlertToast = ref(false)
const showWebhookDialog = ref(false)
const hasNotified = ref<Set<string>>(new Set())

const webhookForm = reactive({
  url: '',
  enabled: false,
  secret: ''
})
const webhookHeaders = ref<{ key: string; value: string }[]>([{ key: '', value: '' }])

const { on: wsOn, off: wsOff } = useWebSocket()

const unresolvedCount = computed(() => alerts.value.filter(a => !a.resolved).length)

const filteredAlerts = computed(() => {
  if (activeTab.value === 'active') {
    return alerts.value.filter(a => !a.resolved && !a.ack)
  } else if (activeTab.value === 'ack') {
    return alerts.value.filter(a => a.ack && !a.resolved)
  } else {
    return alerts.value.filter(a => a.resolved)
  }
})

function getAlertTypeLabel(type: AlertType): string {
  const labels: Record<AlertType, string> = {
    latency_spike: '延迟尖峰',
    retransmit_surge: '重传激增',
    anomaly: 'ML 异常检测'
  }
  return labels[type] || type
}

function formatValue(value: number, type: AlertType): string {
  if (type === 'retransmit_surge') {
    return `${value} 次`
  }
  return `${value.toFixed(1)} ms`
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60000) return `${Math.floor(diff / 1000)} 秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(timestamp).toLocaleString('zh-CN')
}

function addHeader() {
  webhookHeaders.value.push({ key: '', value: '' })
}

function removeHeader(idx: number) {
  webhookHeaders.value.splice(idx, 1)
}

async function loadAlerts() {
  try {
    const res = await fetch('/api/v1/alerts?limit=100')
    if (res.ok) {
      alerts.value = await res.json()
    }
  } catch (e) {
    // ignore
  }
}

async function ackAlert(alert: Alert) {
  try {
    const res = await fetch(`/api/v1/alerts/${alert.id}/ack`, { method: 'POST' })
    if (res.ok) {
      const a = alerts.value.find(x => x.id === alert.id)
      if (a) a.ack = true
      ElMessage.success('告警已确认')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

async function resolveAlert(alert: Alert) {
  try {
    const res = await fetch(`/api/v1/alerts/${alert.id}/resolve`, { method: 'POST' })
    if (res.ok) {
      const a = alerts.value.find(x => x.id === alert.id)
      if (a) a.resolved = true
      ElMessage.success('已标记为恢复')
    }
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

async function loadWebhook() {
  try {
    const res = await fetch('/api/v1/webhook')
    if (res.ok) {
      const cfg = await res.json()
      webhookForm.url = cfg.url || ''
      webhookForm.enabled = cfg.enabled || false
      webhookForm.secret = cfg.secret || ''
      webhookHeaders.value = Object.entries(cfg.headers || {}).map(([key, value]) => ({ key, value: value as string }))
      if (webhookHeaders.value.length === 0) webhookHeaders.value = [{ key: '', value: '' }]
    }
  } catch (e) {
    // ignore
  }
}

async function saveWebhook() {
  const headers: Record<string, string> = {}
  for (const h of webhookHeaders.value) {
    if (h.key && h.value) headers[h.key] = h.value
  }

  try {
    const res = await fetch('/api/v1/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookForm.url,
        enabled: webhookForm.enabled,
        secret: webhookForm.secret,
        headers
      })
    })
    if (res.ok) {
      ElMessage.success('Webhook 配置已保存')
      showWebhookDialog.value = false
    } else {
      ElMessage.error('保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

function handleNewAlert(data: unknown) {
  const alert = data as Alert
  if (hasNotified.value.has(alert.id)) return

  const idx = alerts.value.findIndex(a => a.id === alert.id)
  if (idx === -1) {
    alerts.value.unshift(alert)
  } else {
    alerts.value[idx] = alert
  }

  if (alerts.value.length > 200) {
    alerts.value = alerts.value.slice(0, 200)
  }

  newAlertIds.value.add(alert.id)
  setTimeout(() => newAlertIds.value.delete(alert.id), 3000)

  if (!alert.resolved && !alert.ack) {
    hasNotified.value.add(alert.id)
    latestAlert.value = alert
    showAlertToast.value = true

    ElNotification({
      title: `网络${alert.severity === 'critical' ? '严重' : '警告'}告警`,
      message: `${alert.sourceService} → ${alert.targetService}: ${alert.message}`,
      type: alert.severity === 'critical' ? 'error' : 'warning',
      duration: 5000,
      offset: 60
    })
  }
}

function removeNewAlert(id: string) {
  newAlertIds.value.delete(id)
}

function onTabChange() {
  // no-op
}

onMounted(() => {
  loadAlerts()
  loadWebhook()
  wsOn('alert', handleNewAlert)
})

onUnmounted(() => {
  wsOff('alert', handleNewAlert)
})
</script>

<style scoped>
.alert-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.alert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.alert-icon {
  color: var(--accent-yellow);
}

.alert-badge {
  margin-left: 4px;
}

.alert-actions {
  display: flex;
  gap: 8px;
}

.alert-tabs {
  flex-shrink: 0;
}

.alert-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.alert-list::-webkit-scrollbar {
  width: 6px;
}

.alert-list::-webkit-scrollbar-track {
  background: transparent;
}

.alert-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.alert-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  height: 200px;
}

.alert-item {
  display: flex;
  background: rgba(15, 52, 96, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.3s;
}

.alert-item.new-alert {
  animation: alert-pulse 1.5s ease-in-out 2;
}

@keyframes alert-pulse {
  0%, 100% { background: rgba(15, 52, 96, 0.3); }
  50% { background: rgba(233, 69, 96, 0.2); }
}

.alert-item.severity-critical {
  border-left: 4px solid var(--accent-red);
}

.alert-item.severity-warning {
  border-left: 4px solid var(--accent-yellow);
}

.alert-indicator {
  width: 4px;
  flex-shrink: 0;
}

.indicator-critical {
  background: var(--accent-red);
  animation: blink 1s infinite;
}

.indicator-warning {
  background: var(--accent-yellow);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.alert-content {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.alert-service {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--text-primary);
}

.service-name {
  font-size: 13px;
}

.arrow-icon {
  font-size: 12px;
  color: var(--text-secondary);
}

.alert-type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.type-latency_spike {
  background: rgba(255, 193, 7, 0.2);
  color: var(--accent-yellow);
}

.type-retransmit_surge {
  background: rgba(233, 69, 96, 0.2);
  color: var(--accent-red);
}

.type-anomaly {
  background: rgba(41, 121, 255, 0.2);
  color: #2979ff;
}

.alert-message {
  color: var(--text-primary);
  font-size: 13px;
}

.alert-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.meta-item {
  display: flex;
  gap: 4px;
  font-size: 11px;
}

.meta-label {
  color: var(--text-secondary);
}

.meta-value {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.meta-value.deviation.high {
  color: var(--accent-red);
  font-weight: 600;
}

.alert-actions-row {
  display: flex;
  gap: 8px;
}

.alert-status-row {
  display: flex;
  gap: 8px;
}

.alert-list-enter-active,
.alert-list-leave-active {
  transition: all 0.3s;
}

.alert-list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.alert-list-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.header-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.alert-toast-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.alert-toast-dialog :deep(.el-dialog__header) {
  display: none;
}

.toast-content {
  display: flex;
  gap: 16px;
  padding: 20px;
  border-radius: 8px;
}

.toast-critical {
  background: rgba(233, 69, 96, 0.15);
  border: 1px solid rgba(233, 69, 96, 0.5);
}

.toast-warning {
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.5);
}

.toast-icon {
  font-size: 40px;
  color: var(--accent-yellow);
  flex-shrink: 0;
}

.toast-critical .toast-icon {
  color: var(--accent-red);
}

.toast-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toast-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.toast-service {
  font-size: 13px;
  color: var(--text-secondary);
}

.toast-message {
  font-size: 14px;
  color: var(--text-primary);
  margin-top: 4px;
}
</style>
