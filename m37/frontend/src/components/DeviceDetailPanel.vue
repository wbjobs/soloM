<script setup lang="ts">
import { computed } from 'vue';
import type { Device, Connection } from '../types';
import { DEVICE_LABELS } from '../config/deviceConfig';

const props = defineProps<{
  device: Device;
  connections: Connection[];
  devices: Device[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const deviceTypeLabel = computed(() => {
  return DEVICE_LABELS[props.device.type] || props.device.type;
});

const relatedConnections = computed(() => {
  return props.connections.filter(
    conn => conn.from === props.device.id || conn.to === props.device.id
  );
});

const connectedDevices = computed(() => {
  const deviceIds = new Set<string>();
  relatedConnections.value.forEach(conn => {
    if (conn.from !== props.device.id) deviceIds.add(conn.from);
    if (conn.to !== props.device.id) deviceIds.add(conn.to);
  });
  return props.devices.filter(d => deviceIds.has(d.id));
});

const detailFields = computed(() => {
  const fields: Array<{ label: string; value: string | number | undefined; key: string }> = [];
  const excludeKeys = ['id', 'type', 'name', 'position'];

  Object.entries(props.device).forEach(([key, value]) => {
    if (!excludeKeys.includes(key) && value !== undefined && value !== '') {
      let label = key;
      if (key === 'ip') label = 'IP 地址';
      else if (key === 'model') label = '型号';
      else if (key === 'os') label = '操作系统';
      else if (key === 'description') label = '描述';
      else if (key === 'mac') label = 'MAC 地址';
      else if (key === 'location') label = '位置';
      else label = key.charAt(0).toUpperCase() + key.slice(1);

      fields.push({ label, value, key });
    }
  });

  return fields;
});

const statusColor = computed(() => {
  const colors: Record<string, string> = {
    router: '#4CAF50',
    firewall: '#F44336',
    core_switch: '#9C27B0',
    switch: '#2196F3',
    server: '#FF9800',
    host: '#607D8B',
    client: '#795548',
  };
  return colors[props.device.type] || '#9E9E9E';
});

function getConnectionTarget(conn: Connection): string {
  if (conn.from === props.device.id) return conn.to;
  return conn.from;
}

function getDeviceName(id: string): string {
  const device = props.devices.find(d => d.id === id);
  return device?.name || id;
}

function formatBandwidth(bw?: number): string {
  if (!bw) return '未知';
  if (bw >= 1000) return `${(bw / 1000).toFixed(1)} Tbps`;
  if (bw >= 1) return `${bw} Gbps`;
  return `${bw * 1000} Mbps`;
}
</script>

<template>
  <div class="detail-panel">
    <div class="panel-header">
      <div class="device-icon" :style="{ background: statusColor }">
        {{ device.type.charAt(0).toUpperCase() }}
      </div>
      <div class="device-header-info">
        <h2 class="device-name">{{ device.name }}</h2>
        <span class="device-type" :style="{ color: statusColor }">
          {{ deviceTypeLabel }}
        </span>
      </div>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="panel-content">
      <div class="info-section">
        <h3 class="section-title">基本信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">设备 ID</span>
            <span class="info-value code">{{ device.id }}</span>
          </div>
          <div
            v-for="field in detailFields"
            :key="field.key"
            class="info-item"
          >
            <span class="info-label">{{ field.label }}</span>
            <span
              :class="['info-value', { code: field.key === 'ip' || field.key === 'mac' }]"
            >
              {{ field.value }}
            </span>
          </div>
          <div v-if="device.position" class="info-item full-width">
            <span class="info-label">坐标位置</span>
            <span class="info-value code">
              X: {{ device.position.x.toFixed(2) }},
              Y: {{ device.position.y.toFixed(2) }},
              Z: {{ device.position.z.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="info-section">
        <h3 class="section-title">
          连接关系
          <span class="count-badge">{{ relatedConnections.length }}</span>
        </h3>

        <div v-if="relatedConnections.length === 0" class="empty-state">
          <span class="empty-icon">🔌</span>
          <span class="empty-text">暂无连接</span>
        </div>

        <div v-else class="connection-list">
          <div
            v-for="(conn, index) in relatedConnections"
            :key="index"
            class="connection-item"
          >
            <div class="connection-arrow">
              <span v-if="conn.from === device.id" class="arrow-out">→</span>
              <span v-else class="arrow-in">←</span>
            </div>
            <div class="connection-info">
              <div class="connection-target">{{ getDeviceName(getConnectionTarget(conn)) }}</div>
              <div class="connection-meta">
                <span v-if="conn.type" class="meta-tag">{{ conn.type }}</span>
                <span class="meta-bandwidth">{{ formatBandwidth(conn.bandwidth) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="info-section">
        <h3 class="section-title">
          互联设备
          <span class="count-badge">{{ connectedDevices.length }}</span>
        </h3>

        <div v-if="connectedDevices.length === 0" class="empty-state">
          <span class="empty-icon">🔗</span>
          <span class="empty-text">暂无互联设备</span>
        </div>

        <div v-else class="device-list">
          <div
            v-for="dev in connectedDevices"
            :key="dev.id"
            class="device-item"
          >
            <span
              class="device-dot"
              :style="{
                background: DEVICE_LABELS[dev.type] ? statusColor : '#9E9E9E'
              }"
            ></span>
            <div class="device-info">
              <div class="device-item-name">{{ dev.name }}</div>
              <div class="device-item-type">{{ DEVICE_LABELS[dev.type] || dev.type }}</div>
            </div>
            <div v-if="dev.ip" class="device-ip">{{ dev.ip }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 10;
}

.device-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.device-header-info {
  flex: 1;
  min-width: 0;
}

.device-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-type {
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.info-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  background: var(--accent-primary);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.info-item:last-child {
  border-bottom: none;
}

.info-item.full-width {
  flex-direction: column;
  align-items: flex-start;
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.info-value {
  font-size: 13px;
  text-align: right;
  word-break: break-all;
}

.info-value.code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
}

.connection-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.connection-arrow {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--bg-primary);
  font-weight: 600;
}

.arrow-out {
  color: var(--accent-success);
}

.arrow-in {
  color: var(--accent-warning);
}

.connection-info {
  flex: 1;
  min-width: 0;
}

.connection-target {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 2px;
}

.connection-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.meta-tag {
  padding: 2px 6px;
  background: var(--accent-primary);
  color: white;
  border-radius: 4px;
  font-size: 11px;
}

.meta-bandwidth {
  font-size: 12px;
  color: var(--text-secondary);
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.device-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-item-name {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-item-type {
  font-size: 11px;
  color: var(--text-secondary);
}

.device-ip {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: var(--accent-primary);
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--text-secondary);
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

.empty-text {
  font-size: 13px;
}
</style>
