<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { dockerApi } from '../api/docker'
import type { ImageLayer } from '../types'

const props = defineProps<{
  imageName: string
}>()

const layers = ref<ImageLayer[]>([])
const expandedIds = ref<Set<string>>(new Set())
const isLoading = ref(false)
const error = ref('')

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString()
}

const totalSize = () => {
  return layers.value.reduce((sum, l) => sum + l.size, 0)
}

const parseCommand = (cmd: string): string => {
  if (!cmd) return ''
  const parts = cmd.split('/bin/sh -c ')
  if (parts.length > 1) return parts[1].trim().replace(/^\#\s*/, '')
  const npmParts = cmd.split('npm ')
  if (npmParts.length > 1) return 'npm ' + npmParts[1].trim()
  if (cmd.length > 80) return cmd.slice(0, 77) + '...'
  return cmd
}

const isExpanded = (id: string) => expandedIds.value.has(id)

const toggleExpand = (id: string) => {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

const loadLayers = async () => {
  if (!props.imageName) return
  isLoading.value = true
  error.value = ''
  try {
    layers.value = await dockerApi.getImageLayers(props.imageName)
    if (layers.value.length > 0) {
      expandedIds.value.add(layers.value[0].id)
    }
  } catch (e: any) {
    error.value = e.toString()
  } finally {
    isLoading.value = false
  }
}

watch(() => props.imageName, loadLayers)
onMounted(loadLayers)
</script>

<template>
  <div class="layer-tree">
    <div v-if="isLoading" style="color: #94a3b8; padding: 12px;">加载镜像层信息...</div>
    <div v-else-if="error" style="color: #fca5a5; padding: 12px;">{{ error }}</div>
    <div v-else-if="layers.length === 0" style="color: #64748b; padding: 12px;">无层信息</div>
    <div v-else>
      <div class="layer-summary">
        共 {{ layers.length }} 层 · 总大小 {{ formatBytes(totalSize()) }}
      </div>
      <div class="layer-list">
        <div
          v-for="(layer, index) in layers"
          :key="layer.id"
          class="layer-node"
          :class="{ expanded: isExpanded(layer.id) }"
        >
          <div class="layer-row" @click="toggleExpand(layer.id)">
            <span class="layer-toggle">
              {{ isExpanded(layer.id) ? '▼' : '▶' }}
            </span>
            <span class="layer-connector">
              <span class="connector-line" v-if="index < layers.length - 1"></span>
              <span class="connector-dot"></span>
            </span>
            <span class="layer-index">#{{ index + 1 }}</span>
            <span class="layer-cmd">{{ parseCommand(layer.created_by) }}</span>
            <span class="layer-size" :class="{ 'size-large': layer.size > 50 * 1024 * 1024 }">
              {{ formatBytes(layer.size) }}
            </span>
            <span v-if="layer.tags && layer.tags.length > 0" class="layer-tag">
              {{ layer.tags[0] }}
            </span>
          </div>
          <div v-if="isExpanded(layer.id)" class="layer-detail">
            <div class="detail-row">
              <span class="detail-label">ID:</span>
              <span class="detail-value mono">{{ layer.id }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">创建时间:</span>
              <span class="detail-value">{{ formatDate(layer.created) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">大小:</span>
              <span class="detail-value">{{ formatBytes(layer.size) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">完整命令:</span>
              <span class="detail-value mono cmd-full">{{ layer.created_by }}</span>
            </div>
            <div v-if="layer.comment" class="detail-row">
              <span class="detail-label">注释:</span>
              <span class="detail-value">{{ layer.comment }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer-tree {
  font-size: 13px;
}
.layer-summary {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #0f172a;
  border-radius: 6px;
}
.layer-list {
  display: flex;
  flex-direction: column;
}
.layer-node {
  border-left: 2px solid #334155;
  margin-left: 12px;
}
.layer-node:last-child {
  border-left-color: transparent;
}
.layer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.layer-row:hover {
  background: #0f172a;
}
.layer-toggle {
  color: #64748b;
  font-size: 10px;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.layer-connector {
  position: relative;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.connector-dot {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3b82f6;
}
.connector-line {
  position: absolute;
  left: 8px;
  top: -6px;
  width: 2px;
  height: 14px;
  background: #334155;
}
.layer-index {
  color: #64748b;
  font-size: 11px;
  min-width: 24px;
  flex-shrink: 0;
}
.layer-cmd {
  color: #e2e8f0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layer-size {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.layer-size.size-large {
  color: #f59e0b;
}
.layer-tag {
  background: #1e3a5f;
  color: #60a5fa;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  flex-shrink: 0;
}
.layer-detail {
  padding: 8px 12px 12px 46px;
  background: #0f172a;
  border-radius: 6px;
  margin: 4px 10px 8px 10px;
}
.detail-row {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}
.detail-label {
  color: #64748b;
  min-width: 60px;
  flex-shrink: 0;
}
.detail-value {
  color: #94a3b8;
  word-break: break-all;
}
.detail-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 11px;
}
.cmd-full {
  max-height: 80px;
  overflow-y: auto;
}
</style>
