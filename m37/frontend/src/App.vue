<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { TopologyRenderer } from './engine';
import type { Device, TopologyData, RouteResult } from './types';
import { generateTopology, fetchSampleData, computeRoute } from './api/topology';
import ControlPanel from './components/ControlPanel.vue';
import DeviceDetailPanel from './components/DeviceDetailPanel.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';

const canvasContainer = ref<HTMLElement | null>(null);
let renderer: TopologyRenderer | null = null;

const selectedDevice = ref<Device | null>(null);
const hoveredDevice = ref<Device | null>(null);
const isLoading = ref(false);
const isRouteLoading = ref(false);
const error = ref<string | null>(null);
const routeError = ref<string | null>(null);
const topologyName = ref('未加载拓扑');
const deviceCount = ref(0);
const connectionCount = ref(0);

const currentTopology = ref<TopologyData | null>(null);
const currentRouteResult = ref<RouteResult | null>(null);

const stats = computed(() => ({
  devices: deviceCount.value,
  connections: connectionCount.value,
}));

const routeInfo = computed(() => {
  if (!currentRouteResult.value) return null;
  return {
    totalHops: currentRouteResult.value.totalHops,
    sourceName: currentRouteResult.value.sourceDevice.name || currentRouteResult.value.sourceDevice.ip,
    destName: currentRouteResult.value.destDevice.name || currentRouteResult.value.destDevice.ip,
    sourceIp: currentRouteResult.value.sourceDevice.ip,
    destIp: currentRouteResult.value.destDevice.ip,
  };
});

onMounted(() => {
  if (canvasContainer.value) {
    renderer = new TopologyRenderer(canvasContainer.value, {
      showGrid: true,
      showAxes: false,
      autoRotate: false,
    });

    renderer.onNodeClick((device) => {
      selectedDevice.value = device;
      if (device && renderer) {
        renderer.highlightNode(device.id);
      } else if (renderer) {
        renderer.clearHighlight();
      }
    });

    renderer.onNodeHover((device) => {
      hoveredDevice.value = device;
    });

    loadSampleData('small');
  }
});

onUnmounted(() => {
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
});

async function loadSampleData(type: 'small' | 'medium' | 'large') {
  isLoading.value = true;
  error.value = null;
  currentRouteResult.value = null;
  routeError.value = null;

  try {
    const data = await fetchSampleData(type);
    currentTopology.value = data;
    await generateAndRender(data);
  } catch (e) {
    error.value = '加载示例数据失败';
    console.error(e);
  } finally {
    isLoading.value = false;
  }
}

async function generateAndRender(data: TopologyData, algorithm: 'force3d' | 'graphviz' = 'force3d') {
  isLoading.value = true;
  error.value = null;
  currentRouteResult.value = null;

  try {
    const response = await generateTopology({
      devices: data.devices,
      connections: data.connections,
      algorithm,
    });

    if (response.success && response.data) {
      topologyName.value = data.name || '网络拓扑';
      deviceCount.value = response.data.devices.length;
      connectionCount.value = response.data.connections.length;

      if (renderer) {
        renderer.renderTopology(response.data.devices, response.data.connections);
      }
    } else {
      error.value = response.error || '生成拓扑失败';
    }
  } catch (e) {
    error.value = '生成拓扑时发生错误';
    console.error(e);
  } finally {
    isLoading.value = false;
  }
}

async function handleComputeRoute(payload: { source_ip: string; dest_ip: string }) {
  if (!currentTopology.value) return;

  isRouteLoading.value = true;
  routeError.value = null;

  try {
    const response = await computeRoute({
      devices: currentTopology.value.devices,
      connections: currentTopology.value.connections,
      source_ip: payload.source_ip,
      dest_ip: payload.dest_ip,
    });

    if (response.success && response.data) {
      const routeData = response.data;

      currentRouteResult.value = {
        path: routeData.path,
        edges: routeData.edges.map(e => ({ from: e[0], to: e[1], edgeIndex: e[2] })),
        totalHops: routeData.total_hops,
        sourceDevice: routeData.path_devices[0],
        destDevice: routeData.path_devices[routeData.path_devices.length - 1],
        pathDevices: routeData.path_devices,
      };

      if (renderer) {
        const edgeIndices = routeData.edges.map(e => e[2]);
        renderer.showRoute(edgeIndices, routeData.path);
      }
    } else {
      routeError.value = response.error || '未找到路由路径';
    }
  } catch (e) {
    routeError.value = '路由计算失败';
    console.error(e);
  } finally {
    isRouteLoading.value = false;
  }
}

function handleClearRoute() {
  currentRouteResult.value = null;
  routeError.value = null;
  if (renderer) {
    renderer.clearRoute();
  }
}

function handleGenerate(request: {
  data: TopologyData;
  algorithm: 'force3d' | 'graphviz';
}) {
  currentTopology.value = request.data;
  generateAndRender(request.data, request.algorithm);
}

function handleLoadSample(type: 'small' | 'medium' | 'large') {
  loadSampleData(type);
}

function handleCloseDetail() {
  selectedDevice.value = null;
  if (renderer) {
    renderer.clearHighlight();
  }
}

function handleToggleAutoRotate(enabled: boolean) {
  renderer?.setAutoRotate(enabled);
}

function handleToggleGrid(show: boolean) {
  renderer?.setShowGrid(show);
}

function handleToggleAxes(show: boolean) {
  renderer?.setShowAxes(show);
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">
          <span class="title-icon">🌐</span>
          分布式网络拓扑交互式沙盘
        </h1>
        <span class="topology-name">{{ topologyName }}</span>
      </div>
      <div class="header-right">
        <div v-if="routeInfo" class="route-badge">
          <span class="route-icon">📡</span>
          <span class="route-text">
            {{ routeInfo.sourceName }} → {{ routeInfo.destName }}
          </span>
          <span class="route-hops">{{ routeInfo.totalHops }} 跳</span>
        </div>
        <div class="stats-badge">
          <span class="stat-item">
            <span class="stat-icon">🔌</span>
            <span class="stat-value">{{ stats.devices }}</span>
            <span class="stat-label">设备</span>
          </span>
          <span class="stat-divider">|</span>
          <span class="stat-item">
            <span class="stat-icon">🔗</span>
            <span class="stat-value">{{ stats.connections }}</span>
            <span class="stat-label">连接</span>
          </span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <aside class="sidebar">
        <ControlPanel
          :current-data="currentTopology"
          @generate="handleGenerate"
          @load-sample="handleLoadSample"
          @toggle-auto-rotate="handleToggleAutoRotate"
          @toggle-grid="handleToggleGrid"
          @toggle-axes="handleToggleAxes"
          @compute-route="handleComputeRoute"
          @clear-route="handleClearRoute"
        />
      </aside>

      <section class="canvas-section">
        <div ref="canvasContainer" class="canvas-container"></div>

        <div v-if="hoveredDevice" class="hover-tooltip">
          <div class="tooltip-name">{{ hoveredDevice.name }}</div>
          <div class="tooltip-type">{{ hoveredDevice.type }}</div>
          <div v-if="hoveredDevice.ip" class="tooltip-ip">{{ hoveredDevice.ip }}</div>
        </div>

        <LoadingOverlay v-if="isLoading" message="正在生成网络拓扑..." />
        <LoadingOverlay v-else-if="isRouteLoading" message="正在计算路由路径..." />

        <div v-if="routeError" class="error-banner route-error">
          <span class="error-icon">⚠️</span>
          <span>{{ routeError }}</span>
        </div>

        <div v-if="routeInfo" class="route-banner">
          <span class="route-banner-icon">📶</span>
          <span class="route-banner-text">
            <strong>路由路径:</strong>
            {{ routeInfo.sourceIp || routeInfo.sourceName }}
            <span class="route-arrow">→</span>
            {{ routeInfo.destIp || routeInfo.destName }}
            <span class="route-banner-hops">({{ routeInfo.totalHops }} 跳)</span>
          </span>
          <button class="route-close-btn" @click="handleClearRoute">×</button>
        </div>

        <div v-if="error" class="error-banner">
          <span class="error-icon">⚠️</span>
          <span>{{ error }}</span>
        </div>
      </section>

      <aside v-if="selectedDevice" class="detail-panel">
        <DeviceDetailPanel
          :device="selectedDevice"
          :connections="currentTopology?.connections || []"
          :devices="currentTopology?.devices || []"
          @close="handleCloseDetail"
        />
      </aside>
    </main>

    <footer class="app-footer">
      <span class="footer-text">💡 左键拖拽旋转视角 | 右键拖拽平移 | 滚轮缩放 | 点击设备查看详情 | 输入 IP 查询路由路径</span>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-title {
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 24px;
}

.topology-name {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.route-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 8px;
  font-size: 13px;
}

.route-icon {
  font-size: 16px;
}

.route-text {
  color: var(--text-primary);
}

.route-hops {
  background: rgba(34, 197, 94, 0.3);
  padding: 2px 10px;
  border-radius: 12px;
  font-weight: 600;
  color: #22c55e;
}

.stats-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  font-size: 13px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  font-size: 14px;
}

.stat-value {
  font-weight: 600;
  color: var(--accent-primary);
}

.stat-label {
  color: var(--text-secondary);
}

.stat-divider {
  color: var(--border-color);
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 340px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
}

.canvas-section {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.hover-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(17, 24, 39, 0.95);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  z-index: 100;
  transform: translate(-50%, -120%);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-lg);
  min-width: 150px;
}

.tooltip-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.tooltip-type {
  font-size: 12px;
  color: var(--accent-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.tooltip-ip {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'Consolas', monospace;
}

.detail-panel {
  width: 360px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
}

.route-banner {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.95));
  color: white;
  padding: 12px 24px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 150;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
}

.route-banner-icon {
  font-size: 20px;
}

.route-banner-text {
  font-size: 14px;
}

.route-banner-text strong {
  margin-right: 8px;
}

.route-arrow {
  margin: 0 8px;
  font-weight: bold;
}

.route-banner-hops {
  margin-left: 8px;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.route-close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.route-close-btn:hover {
  background: rgba(255, 255, 255, 0.35);
}

.error-banner {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(239, 68, 68, 0.9);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 200;
  backdrop-filter: blur(8px);
}

.route-error {
  top: 80px;
}

.error-icon {
  font-size: 18px;
}

.app-footer {
  padding: 8px 24px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  text-align: center;
}

.footer-text {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
