<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TopologyData } from '../types';

const props = defineProps<{
  currentData: TopologyData | null;
}>();

const emit = defineEmits<{
  (e: 'generate', payload: { data: TopologyData; algorithm: 'force3d' | 'graphviz' }): void;
  (e: 'load-sample', type: 'small' | 'medium' | 'large'): void;
  (e: 'toggle-auto-rotate', enabled: boolean): void;
  (e: 'toggle-grid', show: boolean): void;
  (e: 'toggle-axes', show: boolean): void;
  (e: 'compute-route', payload: { source_ip: string; dest_ip: string }): void;
  (e: 'clear-route'): void;
}>();

const selectedAlgorithm = ref<'force3d' | 'graphviz'>('force3d');
const graphvizLayout = ref('fdp');
const jsonInput = ref('');
const jsonError = ref<string | null>(null);

const autoRotate = ref(false);
const showGrid = ref(true);
const showAxes = ref(false);

const sourceIp = ref('');
const destIp = ref('');
const routeError = ref<string | null>(null);
const isRouteComputing = ref(false);

watch(() => props.currentData, (data) => {
  if (data) {
    jsonInput.value = JSON.stringify(data, null, 2);
  }
}, { immediate: true });

function handleGenerate() {
  jsonError.value = null;

  try {
    const data = JSON.parse(jsonInput.value) as TopologyData;

    if (!data.devices || !Array.isArray(data.devices)) {
      throw new Error('缺少 devices 数组');
    }
    if (!data.connections || !Array.isArray(data.connections)) {
      throw new Error('缺少 connections 数组');
    }

    const options = selectedAlgorithm.value === 'graphviz'
      ? { layout_type: graphvizLayout.value }
      : undefined;

    emit('generate', {
      data: {
        ...data,
        options,
      },
      algorithm: selectedAlgorithm.value,
    });
  } catch (e) {
    jsonError.value = e instanceof Error ? e.message : 'JSON 格式错误';
  }
}

function loadSample(type: 'small' | 'medium' | 'large') {
  emit('load-sample', type);
}

function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value;
  emit('toggle-auto-rotate', autoRotate.value);
}

function toggleGrid() {
  showGrid.value = !showGrid.value;
  emit('toggle-grid', showGrid.value);
}

function toggleAxes() {
  showAxes.value = !showAxes.value;
  emit('toggle-axes', showAxes.value);
}

function formatJson() {
  try {
    const data = JSON.parse(jsonInput.value);
    jsonInput.value = JSON.stringify(data, null, 2);
    jsonError.value = null;
  } catch (e) {
    jsonError.value = '无法格式化：JSON 格式错误';
  }
}

function clearJson() {
  jsonInput.value = JSON.stringify({
    name: '自定义网络',
    description: '',
    devices: [],
    connections: [],
  }, null, 2);
  jsonError.value = null;
}

async function handleComputeRoute() {
  if (!sourceIp.value.trim() || !destIp.value.trim()) {
    routeError.value = '请输入源 IP 和目的 IP';
    return;
  }

  if (!props.currentData) {
    routeError.value = '请先生成或加载网络拓扑';
    return;
  }

  routeError.value = null;
  isRouteComputing.value = true;

  try {
    emit('compute-route', {
      source_ip: sourceIp.value.trim(),
      dest_ip: destIp.value.trim(),
    });
  } catch (e) {
    routeError.value = e instanceof Error ? e.message : '路由计算失败';
  } finally {
    isRouteComputing.value = false;
  }
}

function handleClearRoute() {
  emit('clear-route');
  routeError.value = null;
}

function fillSampleIps() {
  if (!props.currentData?.devices) return;

  const hosts = props.currentData.devices.filter(d => d.ip && (d.type === 'host' || d.type === 'server' || d.type === 'client'));
  const routers = props.currentData.devices.filter(d => d.ip && d.type === 'router');

  if (hosts.length >= 2) {
    sourceIp.value = hosts[0].ip!;
    destIp.value = hosts[hosts.length - 1].ip!;
  } else if (routers.length >= 2) {
    sourceIp.value = routers[0].ip!;
    destIp.value = routers[routers.length - 1].ip!;
  } else if (props.currentData.devices.filter(d => d.ip).length >= 2) {
    const ips = props.currentData.devices.filter(d => d.ip);
    sourceIp.value = ips[0].ip!;
    destIp.value = ips[ips.length - 1].ip!;
  }
}
</script>

<template>
  <div class="control-panel">
    <div class="panel-section">
      <h3 class="section-title">📊 示例拓扑</h3>
      <div class="sample-buttons">
        <button class="btn btn-secondary" @click="loadSample('small')">
          小型网络
          <span class="badge">9 设备</span>
        </button>
        <button class="btn btn-secondary" @click="loadSample('medium')">
          中型网络
          <span class="badge">50 设备</span>
        </button>
        <button class="btn btn-secondary" @click="loadSample('large')">
          大型网络
          <span class="badge">190+ 设备</span>
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <div class="panel-section">
      <h3 class="section-title">⚙️ 布局算法</h3>
      <div class="algorithm-options">
        <label class="radio-label">
          <input
            type="radio"
            v-model="selectedAlgorithm"
            value="force3d"
            class="radio-input"
          />
          <div class="radio-content">
            <div class="radio-title">3D 力导向布局</div>
            <div class="radio-desc">自定义物理模拟算法，支持分层展示</div>
          </div>
        </label>

        <label class="radio-label">
          <input
            type="radio"
            v-model="selectedAlgorithm"
            value="graphviz"
            class="radio-input"
          />
          <div class="radio-content">
            <div class="radio-title">Graphviz</div>
            <div class="radio-desc">经典图布局算法，2D 投影到 3D</div>
          </div>
        </label>
      </div>

      <div v-if="selectedAlgorithm === 'graphviz'" class="graphviz-options">
        <label class="label">Graphviz 布局类型</label>
        <select v-model="graphvizLayout" class="select">
          <option value="dot">Dot (层次布局)</option>
          <option value="neato">Neato (弹簧模型)</option>
          <option value="fdp">FDP (力导向)</option>
          <option value="sfdp">SFDP (多尺度)</option>
          <option value="twopi">Twopi (放射状)</option>
          <option value="circo">Circo (环形)</option>
        </select>
      </div>
    </div>

    <div class="divider"></div>

    <div class="panel-section">
      <h3 class="section-title">📝 JSON 编辑器</h3>
      <div class="json-actions">
        <button class="btn btn-secondary btn-sm" @click="formatJson">格式化</button>
        <button class="btn btn-secondary btn-sm" @click="clearJson">清空</button>
      </div>
      <textarea
        v-model="jsonInput"
        class="textarea json-editor"
        placeholder="粘贴 JSON 格式的网络拓扑数据..."
        rows="12"
      ></textarea>
      <div v-if="jsonError" class="json-error">
        <span>⚠️</span> {{ jsonError }}
      </div>
      <button class="btn btn-primary generate-btn" @click="handleGenerate">
        🚀 生成拓扑
      </button>
    </div>

    <div class="divider"></div>

    <div class="panel-section">
      <h3 class="section-title">🌐 路由路径查询</h3>
      <div class="route-inputs">
        <div class="route-input-group">
          <label class="label">源 IP 地址</label>
          <input
            v-model="sourceIp"
            type="text"
            class="input"
            placeholder="例如: 192.168.1.100"
            @keyup.enter="handleComputeRoute"
          />
        </div>
        <div class="route-input-group">
          <label class="label">目的 IP 地址</label>
          <input
            v-model="destIp"
            type="text"
            class="input"
            placeholder="例如: 10.0.0.50"
            @keyup.enter="handleComputeRoute"
          />
        </div>
      </div>
      <div class="route-actions">
        <button
          class="btn btn-primary"
          @click="handleComputeRoute"
          :disabled="isRouteComputing || !currentData"
        >
          <span v-if="isRouteComputing">⏳ 计算中...</span>
          <span v-else>🔍 查询路由</span>
        </button>
        <button
          class="btn btn-secondary"
          @click="fillSampleIps"
          :disabled="!currentData"
        >
          📋 填入示例
        </button>
        <button
          class="btn btn-secondary"
          @click="handleClearRoute"
        >
          ❌ 清除
        </button>
      </div>
      <div v-if="routeError" class="json-error">
        <span>⚠️</span> {{ routeError }}
      </div>
    </div>

    <div class="divider"></div>

    <div class="panel-section">
      <h3 class="section-title">🎮 显示控制</h3>
      <div class="toggle-options">
        <label class="toggle-label">
          <input
            type="checkbox"
            v-model="autoRotate"
            @change="toggleAutoRotate"
            class="toggle-input"
          />
          <span class="toggle-slider"></span>
          <span class="toggle-text">自动旋转</span>
        </label>

        <label class="toggle-label">
          <input
            type="checkbox"
            v-model="showGrid"
            @change="toggleGrid"
            class="toggle-input"
            checked
          />
          <span class="toggle-slider"></span>
          <span class="toggle-text">显示网格</span>
        </label>

        <label class="toggle-label">
          <input
            type="checkbox"
            v-model="showAxes"
            @change="toggleAxes"
            class="toggle-input"
          />
          <span class="toggle-slider"></span>
          <span class="toggle-text">显示坐标轴</span>
        </label>
      </div>
    </div>

    <div class="divider"></div>

    <div class="panel-section">
      <h3 class="section-title">🎨 设备图例</h3>
      <div class="legend-list">
        <div class="legend-item">
          <span class="legend-dot" style="background: #4CAF50;"></span>
          <span class="legend-text">路由器 (Router)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #F44336;"></span>
          <span class="legend-text">防火墙 (Firewall)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #9C27B0;"></span>
          <span class="legend-text">核心交换机</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #2196F3;"></span>
          <span class="legend-text">交换机 (Switch)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #FF9800;"></span>
          <span class="legend-text">服务器 (Server)</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #607D8B;"></span>
          <span class="legend-text">主机/客户端</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  padding: 16px;
  height: 100%;
}

.panel-section {
  margin-bottom: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.sample-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sample-buttons .btn {
  justify-content: space-between;
}

.badge {
  background: var(--accent-primary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.algorithm-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.radio-label:hover {
  border-color: var(--accent-primary);
}

.radio-input:checked + .radio-content .radio-title {
  color: var(--accent-primary);
}

.radio-input {
  margin-top: 4px;
}

.radio-title {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 2px;
}

.radio-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.graphviz-options {
  margin-top: 12px;
}

.json-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.json-editor {
  font-size: 12px;
  line-height: 1.5;
  max-height: 240px;
}

.json-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #fca5a5;
  display: flex;
  align-items: center;
  gap: 6px;
}

.generate-btn {
  width: 100%;
  justify-content: center;
  margin-top: 12px;
  padding: 12px;
  font-size: 15px;
}

.route-inputs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.route-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.route-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.route-actions .btn {
  flex: 1;
  min-width: 100px;
  justify-content: center;
  padding: 8px 10px;
  font-size: 13px;
}

.toggle-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 4px 0;
}

.toggle-input {
  display: none;
}

.toggle-slider {
  width: 40px;
  height: 22px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 11px;
  position: relative;
  transition: all 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  background: var(--text-secondary);
  border-radius: 50%;
  top: 1px;
  left: 1px;
  transition: all 0.2s;
}

.toggle-input:checked + .toggle-slider {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.toggle-input:checked + .toggle-slider::after {
  left: 19px;
  background: white;
}

.toggle-text {
  font-size: 14px;
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-text {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
